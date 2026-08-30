console.log("welcome to websocket");

import { WebSocketServer, WebSocket } from "ws";
import jwt from "jsonwebtoken";
import { JWT_SECRET } from "@repo/shared";
import prisma from "@repo/db/client";

const wss = new WebSocketServer({ port: 8080 });

interface User {
  id: string | null;
  rooms: string[];
  ws: WebSocket;
  rateLimitWindow?: number;
  messageCount?: number;
}

const users: User[] = [];

function checkUser(token: string): string | null {
  try {
    const decode = jwt.verify(token, JWT_SECRET);
    if (typeof decode === "string") return null;
    if (!decode || !decode.userId) return null;
    return decode.userId;
  } catch (e) {
    return null;
  }
}

wss.on("connection", function connection(ws, request) {
  const url = request.url;
  if (!url) return;

  const queryParams = new URLSearchParams(url.split("?")[1] || "");
  const token = queryParams.get("token");
  
  const userId = token ? checkUser(token) : null;

  users.push({
    id: userId,
    rooms: [],
    ws,
  });

  ws.on("message", async function message(data) {
    let parsedData;
    try {
      parsedData = JSON.parse(data.toString());
    } catch (e) {
      return;
    }

    if (parsedData.type === "join_room") {
      const user = users.find((x) => x.ws === ws);
      if (user) {
        user.rooms.push(parsedData.roomId);
      }
      
      // Auto-add to editors if they join using the edit link
      if (userId) {
        // Safe async operation to register editor in background
        prisma.room.findFirst({
          where: { OR: [{ slug: parsedData.roomId }, { collabSlug: parsedData.roomId }] },
          include: { editors: true }
        }).then(async (room) => {
          if (room && room.adminId !== Number(userId)) {
            const isEditor = room.editors.some(e => e.id === Number(userId));
            if (!isEditor) {
              await prisma.room.update({
                where: { id: room.id },
                data: { editors: { connect: { id: Number(userId) } } }
              });
            }
          }
        }).catch(err => console.error(err));
      }
    }

    if (parsedData.type === "leave_room") {
      const user = users.find((x) => x.ws === ws);
      if (user) {
        user.rooms = user.rooms.filter((x) => x !== parsedData.roomId);
      }
    }

    if (parsedData.type === "sync") {
      const roomId = parsedData.roomId;
      const lastSequenceNumber = parsedData.lastSequenceNumber || 0;
      
      const room = await prisma.room.findFirst({
        where: { OR: [{ slug: roomId }, { viewSlug: roomId }, { collabSlug: roomId }] }
      });
      
      if (room) {
        const missedChats = await prisma.chat.findMany({
          where: {
            roomId: room.id,
            id: { gt: lastSequenceNumber }
          },
          orderBy: { id: 'asc' }
        });
        
        missedChats.forEach(chat => {
          ws.send(
            JSON.stringify({
              type: "chat",
              message: chat.message,
              roomId: roomId,
              senderId: chat.userId,
              sequenceNumber: chat.id,
            })
          );
        });
      }
    }

    if (parsedData.type === "chat") {
      const message = parsedData.message;
      const roomId = parsedData.roomId;

      if (!userId) {
        ws.send(JSON.stringify({
          type: "error",
          message: "Sign in to share or collaborate"
        }));
        return;
      }

      // Basic Rate Limiting
      const now = Date.now();
      const userState = users.find(u => u.id === userId && u.ws === ws);
      if (userState) {
        if (!userState.rateLimitWindow || now - userState.rateLimitWindow > 1000) {
          userState.rateLimitWindow = now;
          userState.messageCount = 0;
        }
        userState.messageCount = (userState.messageCount || 0) + 1;
        
        if (userState.messageCount > 50) {
          ws.send(JSON.stringify({ type: "error", message: "Rate limit exceeded. Please slow down." }));
          return;
        }
      }

      const room = await prisma.room.findFirst({ 
        where: { OR: [{ slug: roomId }, { viewSlug: roomId }, { collabSlug: roomId }] },
        include: { editors: true }
      });
      if (room) {
        if (room.viewSlug === roomId) {
          ws.send(JSON.stringify({ type: "error", message: "Cannot edit using a view link" }));
          return;
        }

        // If they possess the secret edit slug and aren't the admin, they are granted editor access!
        const numUserId = Number(userId);
        if (room.adminId && room.adminId !== numUserId) {
          const isEditor = room.editors.some(editor => editor.id === numUserId);
          if (!isEditor) {
            // Auto-add them to editors so they show up in the Share Modal UI!
            await prisma.room.update({
              where: { id: room.id },
              data: {
                editors: {
                  connect: { id: numUserId }
                }
              }
            });
            room.editors.push({ id: numUserId } as any); // Optimistically update local room object
          }
        }

        const chat = await prisma.chat.create({
          data: {
            userId: Number(userId),
            roomId: room.id,
            message,
          },
        });

        // Broadcast with sequenceNumber (the chat id)
        users.forEach((user) => {
          if (user.rooms.includes(roomId) || (room?.viewSlug && user.rooms.includes(room.viewSlug))) {
            user.ws.send(
              JSON.stringify({
                type: "chat",
                message: message,
                roomId,
                senderId: userId,
                sequenceNumber: chat.id,
              }),
            );
          }
        });
      }
    }
  });

  ws.on("close", () => {
    const index = users.findIndex(u => u.ws === ws);
    if (index !== -1) {
      users.splice(index, 1);
    }
  });
});
