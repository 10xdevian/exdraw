console.log("welcome to websocket (Phase 2)");

import { WebSocketServer, WebSocket } from "ws";
import jwt from "jsonwebtoken";
import { JWT_SECRET } from "@repo/shared";
import prisma from "@repo/db/client";
import Redis from "ioredis";

// REDIS CONFIGURATION
const REDIS_URL = process.env.REDIS_URL || "redis://localhost:6379";
const redis = new Redis(REDIS_URL);
const pub = new Redis(REDIS_URL);
const sub = new Redis(REDIS_URL);

const wss = new WebSocketServer({ port: 8080 });

interface User {
  id: string | null;
  rooms: string[];
  ws: WebSocket;
  isAlive: boolean; // For Heartbeat
}

const users: User[] = [];

// PUB/SUB GLOBAL SUBSCRIPTION
sub.subscribe("canvas_events", (err) => {
  if (err) console.error("Failed to subscribe to Redis:", err);
});

sub.on("message", (channel, message) => {
  if (channel === "canvas_events") {
    try {
      const data = JSON.parse(message);
      // Route message to all local WS users in the target room
      users.forEach((user) => {
        if (
          user.rooms.includes(data.roomId) || 
          (data.viewSlug && user.rooms.includes(data.viewSlug))
        ) {
          user.ws.send(JSON.stringify({
            type: "chat",
            message: data.message,
            roomId: data.roomId,
            senderId: data.senderId,
            sequenceNumber: data.sequenceNumber,
          }));
        }
      });
    } catch (e) {
      console.error("PubSub parse error", e);
    }
  }
});

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

// HEARTBEAT LOOP (Lifecycle)
const interval = setInterval(() => {
  users.forEach((user) => {
    if (user.isAlive === false) {
      // Remove from presence
      user.rooms.forEach(roomId => {
        if (user.id) redis.srem(`room:${roomId}:presence`, user.id);
      });
      return user.ws.terminate();
    }
    user.isAlive = false;
    user.ws.ping();
  });
}, 30000);

wss.on("close", () => clearInterval(interval));

// Helper: Ephemeral Room State Cache
async function getCachedRoom(roomId: string) {
  const cacheKey = `room_cache:${roomId}`;
  const cached = await redis.get(cacheKey);
  if (cached) return JSON.parse(cached);

  const room = await prisma.room.findFirst({ 
    where: { OR: [{ slug: roomId }, { viewSlug: roomId }, { collabSlug: roomId }] },
    include: { editors: true }
  });

  if (room) {
    await redis.set(cacheKey, JSON.stringify(room), "EX", 300); // 5 min cache
  }
  return room;
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
    isAlive: true,
  });

  ws.on("pong", () => {
    const user = users.find(u => u.ws === ws);
    if (user) user.isAlive = true;
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
        if (userId) {
           redis.sadd(`room:${parsedData.roomId}:presence`, userId);
           redis.expire(`room:${parsedData.roomId}:presence`, 3600);
        }
      }
      
      if (userId) {
        const room = await getCachedRoom(parsedData.roomId);
        if (room && room.adminId !== Number(userId)) {
          const isEditor = room.editors.some((e: any) => e.id === Number(userId));
          if (!isEditor) {
            await prisma.room.update({
              where: { id: room.id },
              data: { editors: { connect: { id: Number(userId) } } }
            });
            await redis.del(`room_cache:${parsedData.roomId}`); // Invalidate cache
          }
        }
      }
    }

    if (parsedData.type === "leave_room") {
      const user = users.find((x) => x.ws === ws);
      if (user) {
        user.rooms = user.rooms.filter((x) => x !== parsedData.roomId);
        if (userId) {
          redis.srem(`room:${parsedData.roomId}:presence`, userId);
        }
      }
    }

    if (parsedData.type === "sync") {
      const roomId = parsedData.roomId;
      const lastSequenceNumber = parsedData.lastSequenceNumber || 0;
      
      const room = await getCachedRoom(roomId);
      if (room) {
        const missedChats = await prisma.chat.findMany({
          where: {
            roomId: room.id,
            id: { gt: lastSequenceNumber }
          },
          orderBy: { id: 'asc' }
        });
        
        missedChats.forEach(chat => {
          ws.send(JSON.stringify({
            type: "chat",
            message: chat.message,
            roomId: roomId,
            senderId: chat.userId,
            sequenceNumber: chat.id,
          }));
        });
      }
    }

    if (parsedData.type === "chat") {
      const message = parsedData.message;
      const roomId = parsedData.roomId;

      if (!userId) {
        ws.send(JSON.stringify({ type: "error", message: "Sign in to share or collaborate" }));
        return;
      }

      // DISTRIBUTED RATE LIMITING
      const rateLimitKey = `ratelimit:${userId}`;
      const requests = await redis.incr(rateLimitKey);
      if (requests === 1) await redis.expire(rateLimitKey, 1);
      
      if (requests > 50) {
        ws.send(JSON.stringify({ type: "error", message: "Rate limit exceeded." }));
        return;
      }

      // IDEMPOTENCY / DUPLICATE PROTECTION
      let eventId = null;
      try {
        const payload = JSON.parse(message);
        eventId = payload.eventId;
      } catch(e) {}
      
      if (eventId) {
        const isDuplicate = await redis.set(`event:${eventId}`, "1", "EX", 60, "NX");
        if (!isDuplicate) return; // Ignore duplicate
      }

      const room = await getCachedRoom(roomId);
      if (room) {
        if (room.viewSlug === roomId) {
          ws.send(JSON.stringify({ type: "error", message: "Cannot edit using a view link" }));
          return;
        }

        const chat = await prisma.chat.create({
          data: {
            userId: Number(userId),
            roomId: room.id,
            message,
          },
        });

        // ROOM METRICS
        redis.hincrby("metrics:rooms", roomId, 1);

        // DISTRIBUTED PUB/SUB BROADCAST
        pub.publish("canvas_events", JSON.stringify({
          message,
          roomId,
          viewSlug: room.viewSlug,
          senderId: userId,
          sequenceNumber: chat.id
        }));
      }
    }
  });

  ws.on("close", () => {
    const index = users.findIndex(u => u.ws === ws);
    if (index !== -1) {
      const user = users[index];
      if (user) {
        user.rooms.forEach(roomId => {
           if (userId) redis.srem(`room:${roomId}:presence`, userId);
        });
      }
      users.splice(index, 1);
    }
  });
});
