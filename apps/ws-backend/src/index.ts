console.log("welcome to websocket (Phase 3)");

import { WebSocketServer, WebSocket } from "ws";
import jwt from "jsonwebtoken";
import { JWT_SECRET } from "@repo/shared";
import prisma from "@repo/db/client";
import Redis from "ioredis";
import { Kafka } from "kafkajs";
import { z } from "zod";
import * as http from "http";

const CanvasEventSchema = z.object({
  eventId: z.string(),
  clientId: z.string(),
  roomId: z.string(),
  timestamp: z.number(),
  action: z.enum(["SHAPE_ADD", "SHAPE_UPDATE", "SHAPE_DELETE", "SHAPES_DELETE"]),
  payload: z.any()
});

// REDIS CONFIGURATION
const REDIS_URL = process.env.REDIS_URL || "redis://localhost:6379";
const redis = new Redis(REDIS_URL);
const pub = new Redis(REDIS_URL);
const sub = new Redis(REDIS_URL);

// KAFKA CONFIGURATION
const kafka = new Kafka({
  clientId: "ws-backend",
  brokers: (process.env.KAFKA_BROKERS || "localhost:9092").split(","),
});
const producer = kafka.producer();
producer.connect().catch(e => console.error("Kafka connect error", e));

// Real, in-process counters for the control-center dashboard. Reset on restart —
// an honest "since this process last started" snapshot, not a durable metrics store.
const startedAt = Date.now();
const metrics = {
  messagesProcessed: 0,
  errorsSent: 0,
  cacheHits: 0,
  cacheMisses: 0,
};

// The WS server and its /health + /metrics HTTP endpoints share one underlying
// http.Server on the same port (8080) — passing `server` instead of `port` to
// WebSocketServer is what makes that possible; ws only takes over the upgrade path.
const httpServer = http.createServer((req, res) => {
  res.setHeader("Access-Control-Allow-Origin", "*");
  if (req.url === "/health") {
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ status: "ok", uptimeMs: Date.now() - startedAt, connections: users.length }));
  } else if (req.url === "/metrics") {
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ uptimeMs: Date.now() - startedAt, connections: users.length, ...metrics }));
  } else {
    res.writeHead(404);
    res.end();
  }
});
const wss = new WebSocketServer({ server: httpServer });
httpServer.listen(8080);

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

// Helper: Room sequence counter (Redis INCR), reseeded from durable history on cold start.
//
// Every client caches the sequenceNumber of the last update it applied to each shape, and
// rejects any incoming update whose sequenceNumber is lower as "stale" (see network.ts).
// Redis here only snapshots to disk periodically (no AOF), so a restart between snapshots
// can roll `room_seq:{roomId}` back to an old, low value — after which every client
// permanently rejects updates to shapes it already knew about, since the "fresh" sequence
// numbers issued post-restart are all lower than what it cached before the restart. Only
// brand-new shapes (no cached sequenceNumber yet) are unaffected, which is exactly the
// "old shapes stop syncing, new ones are fine" symptom this fixes.
//
// Fix: the first time this counter is touched after a cold start, seed it from the room's
// own durable max Chat.id (Postgres, never resets) before incrementing, so it can never
// hand out a number lower than history already implies. SETNX makes the seed race-safe
// under concurrent messages arriving right as Redis comes back up.
async function nextRoomSequence(roomId: number): Promise<number> {
  const seqKey = `room_seq:${roomId}`;
  const alreadySeeded = await redis.exists(seqKey);
  if (!alreadySeeded) {
    const { _max } = await prisma.chat.aggregate({ where: { roomId }, _max: { id: true } });
    await redis.set(seqKey, _max.id || 0, "NX");
  }
  return redis.incr(seqKey);
}

function sendError(ws: WebSocket, message: string) {
  metrics.errorsSent++;
  ws.send(JSON.stringify({ type: "error", message }));
}

// Helper: Ephemeral Room State Cache
async function getCachedRoom(roomId: string) {
  const cacheKey = `room_cache:${roomId}`;
  const cached = await redis.get(cacheKey);
  if (cached) {
    metrics.cacheHits++;
    return JSON.parse(cached);
  }
  metrics.cacheMisses++;

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
        // IMPORTANT: filter/order by the `sequenceNumber` column, not the row `id`.
        // `id` is a Postgres-wide autoincrement shared across every room; `sequenceNumber`
        // is the per-room counter from nextRoomSequence, the same one live "chat" events
        // are numbered with. A client's `lastSequenceNumber` cursor — and every shape's
        // cached sequenceNumber used for stale-update rejection in network.ts — live in
        // that per-room space. Comparing them against `id` instead handed out numbers
        // wildly out of step with what clients had cached, which made every future live
        // update to an already-synced shape look "stale" and get silently dropped.
        const missedChats = await prisma.chat.findMany({
          where: {
            roomId: room.id,
            sequenceNumber: { gt: lastSequenceNumber }
          },
          orderBy: { sequenceNumber: 'asc' }
        });

        missedChats.forEach(chat => {
          ws.send(JSON.stringify({
            type: "chat",
            message: chat.message,
            roomId: roomId,
            senderId: chat.userId,
            sequenceNumber: chat.sequenceNumber,
          }));
        });
      }
    }


    if (parsedData.type === "chat") {
      metrics.messagesProcessed++;
      const message = parsedData.message;
      const roomId = parsedData.roomId;

      if (!userId) {
        sendError(ws, "Sign in to share or collaborate");
        return;
      }

      // STRICT SCHEMA VALIDATION
      let payload;
      try {
        payload = JSON.parse(message);
        CanvasEventSchema.parse(payload);
      } catch(e) {
        sendError(ws, "Malformed or invalid payload.");
        return;
      }

      // DISTRIBUTED RATE LIMITING
      const rateLimitKey = `ratelimit:${userId}`;
      const requests = await redis.incr(rateLimitKey);
      if (requests === 1) await redis.expire(rateLimitKey, 1);
      
      if (requests > 50) {
        sendError(ws, "Rate limit exceeded.");
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
          sendError(ws, "Cannot edit using a view link");
          return;
        }

        // Generate strict sequence number via Redis for the room
        const sequenceNumber = await nextRoomSequence(room.id);

        // DISTRIBUTED PUB/SUB BROADCAST (Fast path)
        pub.publish("canvas_events", JSON.stringify({
          message,
          roomId,
          viewSlug: room.viewSlug,
          senderId: userId,
          sequenceNumber: sequenceNumber
        }));

        // KAFKA DURABLE EVENT PIPELINE (Async path)
        await producer.send({
          topic: "canvas_events",
          messages: [
            {
              key: roomId, // partition by room to maintain order
              value: JSON.stringify({
                userId: Number(userId),
                roomId: room.id,
                message,
                sequenceNumber
              })
            }
          ]
        });
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
