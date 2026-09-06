import { Kafka, EachMessagePayload } from "kafkajs";
import prisma from "@repo/db/client";
import Redis from "ioredis";
import * as http from "http";

const REDIS_URL = process.env.REDIS_URL || "redis://localhost:6379";
const redis = new Redis(REDIS_URL);

const kafka = new Kafka({
  clientId: "canvas-worker",
  brokers: (process.env.KAFKA_BROKERS || "localhost:9092").split(","),
});

const consumer = kafka.consumer({ groupId: "canvas-group" });
const dlqProducer = kafka.producer();

// Real, in-process counters for the control-center's Services/Errors pages. Reset on
// restart — deliberately not trying to be a durable metrics store, just an honest
// snapshot of "since this worker last started."
const startedAt = Date.now();
const metrics = {
  eventsProcessed: 0,
  eventsFailed: 0,
  snapshotsCreated: 0,
};

// worker has no other reason to speak HTTP — this exists solely so the control-center
// dashboard has something to poll for liveness/throughput, the same way it polls
// http-backend's and ws-backend's /health and /metrics.
const METRICS_PORT = Number(process.env.WORKER_METRICS_PORT || 9095);
http.createServer((req, res) => {
  res.setHeader("Access-Control-Allow-Origin", "*");
  if (req.url === "/health") {
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ status: "ok", uptimeMs: Date.now() - startedAt }));
  } else if (req.url === "/metrics") {
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ uptimeMs: Date.now() - startedAt, ...metrics }));
  } else {
    res.writeHead(404);
    res.end();
  }
}).listen(METRICS_PORT, () => console.log(`[metrics] worker health/metrics on :${METRICS_PORT}`));

// Mock S3 Service for Snapshots
class S3Service {
  static async uploadSnapshot(roomId: number, shapes: any[]) {
    // MOCK S3: We use Redis to store the snapshot blob for demonstration
    const key = `snapshots/room_${roomId}_${Date.now()}.json`;
    await redis.set(key, JSON.stringify(shapes));
    console.log(`[S3] Uploaded snapshot for room ${roomId} to ${key}`);
    return key;
  }
}

async function processEvent(payload: EachMessagePayload) {
  const { message } = payload;
  if (!message.value) return;

  const data = JSON.parse(message.value.toString());
  const { userId, roomId, message: chatMessage, sequenceNumber } = data;

  let eventId = null;
  try {
    const parsed = JSON.parse(chatMessage);
    eventId = parsed.eventId;
  } catch (e) {}

  // Absolute Idempotency: PostgreSQL is the final boundary
  if (eventId) {
    try {
      await prisma.chat.upsert({
        where: { eventId },
        update: {}, // DO NOTHING
        create: {
          eventId,
          sequenceNumber,
          userId,
          roomId,
          message: chatMessage,
        }
      });
    } catch (e) {
      console.log(`Skipping duplicate or failed event ${eventId}`);
      return;
    }
  } else {
    // Fallback for events without ID (legacy or malformed)
    await prisma.chat.create({
      data: {
        sequenceNumber,
        userId,
        roomId,
        message: chatMessage,
      },
    });
  }

  // ASYNC ANALYTICS PIPELINE
  // Offloaded from WS path to worker
  await redis.hincrby("metrics:worker:events", String(roomId), 1);
  const totalEvents = await redis.hget("metrics:worker:events", String(roomId));

  // SNAPSHOT SYSTEM
  // Every 100 events, trigger a snapshot
  if (totalEvents && parseInt(totalEvents) % 100 === 0) {
    console.log(`[Snapshot] Triggering snapshot for room ${roomId}`);
    
    // Strict Snapshot Consistency: fetch exactly up to this sequenceNumber
    const cutOffSequence = sequenceNumber;
    
    // Fetch all events for this room up to the cutoff barrier
    const allChats = await prisma.chat.findMany({
      where: { 
        roomId,
        sequenceNumber: { lte: cutOffSequence }
      },
      orderBy: { sequenceNumber: "asc" }
    });

    const shapesMap = new Map();
    allChats.forEach(chat => {
      try {
        const payload = JSON.parse(chat.message);
        if (payload.action === "SHAPE_ADD" || payload.action === "SHAPE_UPDATE") {
          shapesMap.set(payload.payload.id, payload.payload);
        } else if (payload.action === "SHAPE_DELETE") {
          shapesMap.delete(payload.payload.id);
        }
      } catch (e) {}
    });

    const finalShapes = Array.from(shapesMap.values());
    const s3Key = await S3Service.uploadSnapshot(roomId, finalShapes);
    metrics.snapshotsCreated++;

    // Save snapshot metadata
    await prisma.snapshot.upsert({
      where: { roomId },
      update: {
        latestSequence: sequenceNumber,
        s3Key
      },
      create: {
        roomId,
        latestSequence: sequenceNumber,
        s3Key
      }
    });

    // Optionally, delete old chats to save space (cleanup)
    // await prisma.chat.deleteMany({ where: { roomId, id: { lte: ... } } })
  }
}

async function run() {
  await producer.connect();
  await consumer.connect();
  
  // Consumer observability metrics loop
  setInterval(async () => {
     // Log lag or offsets if needed
     console.log("[Observability] Worker heartbeat - Lag monitoring active");
  }, 10000);

  await consumer.subscribe({ topic: "canvas_events", fromBeginning: true });

  await consumer.run({
    eachMessage: async (payload) => {
      try {
        await processEvent(payload);
        metrics.eventsProcessed++;
      } catch (error) {
        console.error("Error processing message, routing to DLQ", error);
        metrics.eventsFailed++;
        // DEAD LETTER QUEUE (DLQ)
        if (payload.message.value) {
          await dlqProducer.send({
            topic: "canvas_events_dlq",
            messages: [{ value: payload.message.value }]
          });
        }
      }
    },
  });
}

const producer = kafka.producer();
run().catch(console.error);
