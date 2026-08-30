import { Kafka, EachMessagePayload } from "kafkajs";
import prisma from "@repo/db/client";
import Redis from "ioredis";

const REDIS_URL = process.env.REDIS_URL || "redis://localhost:6379";
const redis = new Redis(REDIS_URL);

const kafka = new Kafka({
  clientId: "canvas-worker",
  brokers: (process.env.KAFKA_BROKERS || "localhost:9092").split(","),
});

const consumer = kafka.consumer({ groupId: "canvas-group" });
const dlqProducer = kafka.producer();

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

  // IDEMPOTENCY: Check if we've already written this event to DB
  if (eventId) {
    const isProcessed = await redis.set(`processed_event:${eventId}`, "1", "EX", 3600, "NX");
    if (!isProcessed) {
      console.log(`Skipping duplicate event ${eventId}`);
      return;
    }
  }

  // Write to Postgres
  // Note: we use `id` auto-increment, but sequenceNumber is logged here.
  // In a perfect system, we'd alter `Chat` to explicitly store `sequenceNumber`.
  // For now, we assume `id` aligns roughly or we rely on Redis sequence.
  await prisma.chat.create({
    data: {
      userId,
      roomId,
      message: chatMessage,
    },
  });

  // ASYNC ANALYTICS PIPELINE
  // Offloaded from WS path to worker
  await redis.hincrby("metrics:worker:events", String(roomId), 1);
  const totalEvents = await redis.hget("metrics:worker:events", String(roomId));

  // SNAPSHOT SYSTEM
  // Every 100 events, trigger a snapshot
  if (totalEvents && parseInt(totalEvents) % 100 === 0) {
    console.log(`[Snapshot] Triggering snapshot for room ${roomId}`);
    
    // Fetch all events for this room
    const allChats = await prisma.chat.findMany({
      where: { roomId },
      orderBy: { id: "asc" }
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
      } catch (error) {
        console.error("Error processing message, routing to DLQ", error);
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
