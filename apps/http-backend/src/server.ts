console.log("Hello http");

import express from "express";
import jwt from "jsonwebtoken";
import { authMiddleware } from "./middleware";
import { JWT_SECRET } from "@repo/shared";
import prisma from "@repo/db/client";
import bcrypt from "bcryptjs";
import cors from "cors";
const app = express();
app.use(express.json());
app.use(cors());

app.post("/signup", async (req, res) => {
  const { username, email, password } = req.body;

  //  check user is exists or not
  const existingUser = await prisma.user.findUnique({
    where: {
      username,
    },
  });

  if (existingUser) {
    return res.status(403).json({
      msg: "User already exists Login please!!",
    });
  }

  //  hashed password
  const hashedPassword = await bcrypt.hash(password, 10);

  const newUser = await prisma.user.create({
    data: {
      username,
      email,
      password: hashedPassword,
    },
  });

  res.status(200).json({
    message: "User created successfully",
    user: {
      id: newUser.id,
      username: newUser.username,
      email: newUser.email,
      password: newUser.password,
    },
  });
});

app.post("/signin", async (req, res) => {
  const { username, password } = req.body;

  //  check user is exists or not
  const existingUser = await prisma.user.findFirst({
    where: {
      OR: [
        { username: username },
        { email: username }
      ]
    },
  });

  if (!existingUser) {
    return res.status(403).json({
      msg: "User not exists Signup please!!",
    });
  }

  //  check password is correct or not
  const isPasswordCorrect = await bcrypt.compare(
    password,
    existingUser.password,
  );

  if (!isPasswordCorrect) {
    return res.status(403).json({
      msg: "Invalid password",
    });
  }

  //  generate token
  const token = jwt.sign({ userId: existingUser.id }, JWT_SECRET);

  res.status(201).json({
    msg: "User logged in successfully",
    token,
  });
});

import * as crypto from 'crypto';

app.post("/room", authMiddleware, async (req, res) => {
  const { name } = req.body;

  //@ts-ignore
  const userId = req.userId;

  const room = await prisma.room.create({
    data: {
      slug: name,
      viewSlug: "view-" + crypto.randomBytes(8).toString('hex'),
      collabSlug: "collab-" + crypto.randomBytes(8).toString('hex'),
      adminId: userId,
    },
  });
  res.status(200).json({
    roomId: room.id,
    viewSlug: room.viewSlug,
  });
});

app.get("/chats/:slug", async (req, res) => {
  const slug = req.params.slug;
  const room = await prisma.room.findFirst({ 
    where: { 
      OR: [{ slug }, { viewSlug: slug }, { collabSlug: slug }] 
    } 
  });
  if (!room) return res.status(404).json({ error: "Room not found" });

  const message = await prisma.chat.findMany({
    where: {
      roomId: room.id,
    },
    orderBy: {
      id: "asc",
    },
  });

  res.status(200).json({
    message,
  });
});

app.get("/rooms", authMiddleware, async (req, res) => {
  //@ts-ignore
  const userId = req.userId;
  
  const rooms = await prisma.room.findMany({
    where: {
      adminId: userId
    },
    include: {
      admin: { select: { username: true } }
    },
    orderBy: { createdAt: 'desc' }
  });
  
  res.status(200).json({ rooms });
});

//

app.get("/room/:slug", async (req, res) => {
  const slug = req.params.slug;
  const room = await prisma.room.findFirst({
    where: { 
      OR: [{ slug }, { viewSlug: slug }, { collabSlug: slug }] 
    },
    include: {
      admin: { select: { id: true, username: true, email: true } },
      editors: { select: { id: true, username: true, email: true } }
    }
  });

  if (!room) {
    res.status(404).json({ error: "Room not found" });
    return;
  }

  let role = "viewer";
  const token = req.headers["token"] || req.headers.authorization;
  if (token && typeof token === 'string') {
    try {
      const decode = jwt.verify(token, JWT_SECRET) as any;
      if (decode && decode.userId) {
        const userId = Number(decode.userId);
        if (room.adminId === userId) {
          role = "owner";
        } else if (room.editors.some((e: any) => e.id === userId)) {
          role = "editor";
        } else if (room.collabSlug === slug) {
          // Auto-join as editor if they used the collab slug
          await prisma.room.update({
            where: { id: room.id },
            data: {
              editors: {
                connect: { id: userId }
              }
            }
          });
          role = "editor";
          // Also update the local room object so the frontend sees them as an editor
          const user = await prisma.user.findUnique({ where: { id: userId } });
          if (user) {
            room.editors.push({ id: user.id, username: user.username, email: user.email } as any);
          }
        }
      }
    } catch (e) {
      // invalid token, default to viewer
    }
  }

  res.status(200).json({
    room,
    role
  });
});


app.post("/room/:slug/invite", authMiddleware, async (req, res) => {
  const { slug } = req.params;
  const { username } = req.body;
  
  //@ts-ignore
  const userId = req.userId;

  const room = await prisma.room.findFirst({ where: { slug } });
  if (!room) return res.status(404).json({ error: "Room not found" });
  if (room.adminId !== userId) return res.status(403).json({ error: "Only the room admin can invite users" });

  const targetUser = await prisma.user.findFirst({ 
    where: { 
      OR: [
        { username },
        { email: username }
      ]
    } 
  });
  if (!targetUser) return res.status(404).json({ error: "User not found" });

  await prisma.room.update({
    where: { id: room.id },
    data: {
      editors: {
        connect: { id: targetUser.id }
      }
    }
  });

  res.status(200).json({ message: "Editor added successfully", user: { id: targetUser.id, username: targetUser.username } });
});

app.post("/room/:slug/regenerate-view", authMiddleware, async (req, res) => {
  const { slug } = req.params;
  
  //@ts-ignore
  const userId = req.userId;

  const room = await prisma.room.findFirst({ where: { slug } });
  if (!room) return res.status(404).json({ error: "Room not found" });
  if (room.adminId !== userId) return res.status(403).json({ error: "Only the room admin can regenerate the view link" });

  const newViewSlug = "view-" + crypto.randomBytes(8).toString('hex');
  
  await prisma.room.update({
    where: { id: room.id },
    data: { viewSlug: newViewSlug }
  });

  res.status(200).json({ viewSlug: newViewSlug });
});

app.post("/room/guest", async (req, res) => {
  const { name } = req.body;
  const room = await prisma.room.create({
    data: {
      slug: name,
      viewSlug: "view-" + crypto.randomBytes(8).toString('hex'),
      collabSlug: "collab-" + crypto.randomBytes(8).toString('hex'),
    },
  });
  res.status(200).json({ roomId: room.id, viewSlug: room.viewSlug });
});

app.post("/room/:slug/sync", async (req, res) => {
  const { slug } = req.params;
  const { shapes } = req.body;
  
  let userId = null;
  const authHeader = req.headers.authorization;
  if (authHeader) {
    try {
      const decoded = jwt.verify(authHeader, JWT_SECRET);
      userId = (decoded as any).userId;
    } catch (e) {
      // invalid token, treat as guest
    }
  }

  // Look up the room. If they used viewSlug, deny edit.
  const room = await prisma.room.findFirst({ 
    where: { 
      OR: [{ slug }, { viewSlug: slug }, { collabSlug: slug }] 
    },
    include: { editors: true }
  });
  
  if (!room) return res.status(404).json({ error: "Room not found" });
  if (room.viewSlug === slug) return res.status(403).json({ error: "Cannot edit using a view link" });

  // STRICT BACKEND ACL
  const numUserId = Number(userId);
  if (room.adminId && room.adminId !== numUserId) {
    let isEditor = room.editors.some(editor => editor.id === numUserId);
    if (!isEditor && room.collabSlug === slug) {
      await prisma.room.update({
        where: { id: room.id },
        data: { editors: { connect: { id: numUserId } } }
      });
      isEditor = true;
    }
    if (!isEditor) {
      return res.status(403).json({ error: "You are not authorized to edit this room" });
    }
  }

  if (shapes && shapes.length > 0) {
    const chats = shapes.map((shape: any) => ({
      roomId: room.id,
      message: JSON.stringify({ shape }),
      userId
    }));
    await prisma.chat.createMany({ data: chats });
  }

  res.status(200).json({ success: true });
});

app.get("/room/:slug/viewers", async (req, res) => {
  const { slug } = req.params;
  const room = await prisma.room.findFirst({ where: { OR: [{ slug }, { viewSlug: slug }, { collabSlug: slug }] } });
  if (!room) return res.status(404).json({ error: "Room not found" });

  const viewers = await prisma.viewer.findMany({ where: { roomId: room.id } });
  res.status(200).json({ viewers });
});

app.post("/room/:slug/viewers", async (req, res) => {
  const { slug } = req.params;
  const { name } = req.body;
  const room = await prisma.room.findFirst({ where: { OR: [{ slug }, { viewSlug: slug }, { collabSlug: slug }] } });
  if (!room) return res.status(404).json({ error: "Room not found" });

  const viewer = await prisma.viewer.create({
    data: { roomId: room.id, name: name || "Guest" }
  });
  res.status(200).json({ viewer });
});

app.listen(3004, () => { console.log("server is running on port http://localhost:3004 "); });
