console.log("Hello http");

import express from "express";
import jwt from "jsonwebtoken";
import { authMiddleware } from "./middleware";
import { JWT_SECRET } from "@repo/shared";
import prisma from "@repo/db/client";
import bcrypt from "bcryptjs";
const app = express();
app.use(express.json());

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
  const existingUser = await prisma.user.findUnique({
    where: {
      username,
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

app.post("/room", authMiddleware, async (req, res) => {
  const { name } = req.body;

  //@ts-ignore
  const userId = req.userId;

  const room = await prisma.room.create({
    data: {
      slug: name,
      adminId: userId,
    },
  });
  res.status(200).json({
    roomId: room.id,
  });
});

app.get("/chats/:roomId", async (req, res) => {
  const roomId = Number(req.params.roomId);

  const message = await prisma.chat.findMany({
    where: {
      roomId: roomId,
    },
    take: 40,
    orderBy: {
      id: "asc",
    },
  });

  res.status(200).json({
    message,
  });
});

//

app.get("/room/:slug", async (req, res) => {
  const slug = req.params.slug;

  const room = await prisma.room.findFirst({
    where: {
      slug,
    },
  });

  res.status(200).json({
    room,
  });
});

app.listen(3001, () => {
  console.log(`server is running on port http://localhost:3001 `);
});
