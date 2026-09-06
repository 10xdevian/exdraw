// Read-only endpoints backing the control-center dashboard (apps/control-center).
//
// Ground rule for every route here: report what the system actually knows right now, and
// say so plainly when it doesn't know something — never synthesize a number to fill a UI
// slot. Where a metric requires instrumentation this codebase didn't already have (e.g.
// Postgres query timing), that instrumentation was added for real (pg_stat_statements),
// not faked at the response layer.
import express from "express";
import Redis from "ioredis";
import { Kafka } from "kafkajs";
import prisma from "@repo/db/client";
import { WS_BACKEND_HTTP_URL, WORKER_METRICS_URL } from "@repo/shared";

const router: express.Router = express.Router();

const REDIS_URL = process.env.REDIS_URL || "redis://localhost:6379";
const redis = new Redis(REDIS_URL);

const kafka = new Kafka({
  clientId: "http-backend-control-center",
  brokers: (process.env.KAFKA_BROKERS || "localhost:9092").split(","),
  // This is a read-only polling client for a dashboard — fail fast rather than retrying
  // for tens of seconds and hanging an HTTP request when a topic doesn't exist yet
  // (e.g. canvas_events_dlq before any message has ever failed) or the broker is down.
  retry: { retries: 2, initialRetryTime: 100 },
});
const kafkaAdmin = kafka.admin();
let kafkaAdminConnected = false;
async function getKafkaAdmin() {
  if (!kafkaAdminConnected) {
    await kafkaAdmin.connect();
    kafkaAdminConnected = true;
  }
  return kafkaAdmin;
}

// ---- Request counters (this process only, since last restart) ----------------------
// Powers Overview's request/error-rate tiles and the Services page's http-backend row.
export const httpMetrics = {
  startedAt: Date.now(),
  total: 0,
  by2xx: 0,
  by4xx: 0,
  by5xx: 0,
  byOther: 0,
};

export function requestCounterMiddleware(req: express.Request, res: express.Response, next: express.NextFunction) {
  res.on("finish", () => {
    httpMetrics.total++;
    const status = res.statusCode;
    if (status >= 200 && status < 300) httpMetrics.by2xx++;
    else if (status >= 400 && status < 500) httpMetrics.by4xx++;
    else if (status >= 500) httpMetrics.by5xx++;
    else httpMetrics.byOther++;
  });
  next();
}

async function fetchJson(url: string, timeoutMs = 2000): Promise<any | null> {
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMs);
    const res = await fetch(url, { signal: controller.signal });
    clearTimeout(timeout);
    if (!res.ok) return null;
    return await res.json();
  } catch {
    return null;
  }
}

// ---- /overview -------------------------------------------------------------------
router.get("/overview", async (_req, res) => {
  const [wsHealth, workerHealth, roomCount, chatCount, userCount] = await Promise.all([
    fetchJson(`${WS_BACKEND_HTTP_URL}/health`),
    fetchJson(`${WORKER_METRICS_URL}/health`),
    prisma.room.count(),
    prisma.chat.count(),
    prisma.user.count(),
  ]);

  const errorRate = httpMetrics.total > 0 ? (httpMetrics.by5xx / httpMetrics.total) * 100 : 0;
  const uptimeMs = Date.now() - httpMetrics.startedAt;

  res.json({
    generatedAt: Date.now(),
    services: {
      httpBackend: { healthy: true },
      wsBackend: { healthy: !!wsHealth, connections: wsHealth?.connections ?? null },
      worker: { healthy: !!workerHealth },
    },
    http: {
      uptimeMs,
      totalRequests: httpMetrics.total,
      requestsSince: "process start (in-memory counter, resets on restart)",
      by2xx: httpMetrics.by2xx,
      by4xx: httpMetrics.by4xx,
      by5xx: httpMetrics.by5xx,
      errorRatePct: Number(errorRate.toFixed(3)),
    },
    domain: { roomCount, chatCount, userCount },
  });
});

// ---- /services -------------------------------------------------------------------
router.get("/services", async (_req, res) => {
  const [wsHealth, wsMetricsData, workerHealth, workerMetricsData] = await Promise.all([
    fetchJson(`${WS_BACKEND_HTTP_URL}/health`),
    fetchJson(`${WS_BACKEND_HTTP_URL}/metrics`),
    fetchJson(`${WORKER_METRICS_URL}/health`),
    fetchJson(`${WORKER_METRICS_URL}/metrics`),
  ]);

  res.json([
    {
      name: "http-backend",
      healthy: true,
      uptimeMs: Date.now() - httpMetrics.startedAt,
      metrics: { totalRequests: httpMetrics.total, by2xx: httpMetrics.by2xx, by4xx: httpMetrics.by4xx, by5xx: httpMetrics.by5xx },
    },
    {
      name: "ws-backend",
      healthy: !!wsHealth,
      uptimeMs: wsHealth?.uptimeMs ?? null,
      metrics: wsMetricsData ? {
        connections: wsMetricsData.connections,
        messagesProcessed: wsMetricsData.messagesProcessed,
        errorsSent: wsMetricsData.errorsSent,
        cacheHits: wsMetricsData.cacheHits,
        cacheMisses: wsMetricsData.cacheMisses,
      } : null,
    },
    {
      name: "worker",
      healthy: !!workerHealth,
      uptimeMs: workerHealth?.uptimeMs ?? null,
      metrics: workerMetricsData ? {
        eventsProcessed: workerMetricsData.eventsProcessed,
        eventsFailed: workerMetricsData.eventsFailed,
        snapshotsCreated: workerMetricsData.snapshotsCreated,
      } : null,
    },
  ]);
});

// ---- /database -------------------------------------------------------------------
router.get("/database", async (_req, res) => {
  try {
    const [userCount, roomCount, chatCount, snapshotCount, viewerCount] = await Promise.all([
      prisma.user.count(),
      prisma.room.count(),
      prisma.chat.count(),
      prisma.snapshot.count(),
      prisma.viewer.count(),
    ]);

    const [sizeRow] = await prisma.$queryRaw<{ size: bigint }[]>`SELECT pg_database_size(current_database()) as size`;
    const [connRow] = await prisma.$queryRaw<{ total: bigint; active: bigint; idle: bigint }[]>`
      SELECT
        count(*) as total,
        count(*) FILTER (WHERE state = 'active') as active,
        count(*) FILTER (WHERE state = 'idle') as idle
      FROM pg_stat_activity WHERE datname = current_database()
    `;
    // `SHOW max_connections` returns a column literally named "max_connections", not
    // "setting" — pg_settings is the queryable form of the same value.
    const [maxConnRow] = await prisma.$queryRaw<{ setting: string }[]>`SELECT setting FROM pg_settings WHERE name = 'max_connections'`;

    // Real query timing from pg_stat_statements — added specifically for this page (see
    // docker-compose.yml). If it's ever disabled, this degrades to an honest empty list
    // rather than fabricated numbers.
    let slowQueries: { query: string; calls: number; meanMs: number; maxMs: number }[] = [];
    let statsAvailable = true;
    try {
      const rows = await prisma.$queryRaw<{ query: string; calls: bigint; mean_exec_time: number; max_exec_time: number }[]>`
        SELECT query, calls, mean_exec_time, max_exec_time
        FROM pg_stat_statements
        WHERE query NOT ILIKE '%pg_stat_statements%'
        ORDER BY mean_exec_time DESC
        LIMIT 10
      `;
      slowQueries = rows.map((r: { query: string; calls: bigint; mean_exec_time: number; max_exec_time: number }) => ({
        query: r.query.length > 140 ? r.query.slice(0, 140) + "…" : r.query,
        calls: Number(r.calls),
        meanMs: Number(r.mean_exec_time.toFixed(2)),
        maxMs: Number(r.max_exec_time.toFixed(2)),
      }));
    } catch {
      statsAvailable = false;
    }

    res.json({
      tables: { users: userCount, rooms: roomCount, chats: chatCount, snapshots: snapshotCount, viewers: viewerCount },
      sizeBytes: Number(sizeRow?.size ?? 0),
      connections: {
        total: Number(connRow?.total ?? 0),
        active: Number(connRow?.active ?? 0),
        idle: Number(connRow?.idle ?? 0),
        max: Number(maxConnRow?.setting ?? 0),
      },
      slowQueries,
      slowQueriesAvailable: statsAvailable,
    });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

// ---- /redis ----------------------------------------------------------------------
router.get("/redis", async (_req, res) => {
  try {
    const info = await redis.info("memory");
    const usedMemoryMatch = info.match(/used_memory:(\d+)/);
    const usedMemoryHumanMatch = info.match(/used_memory_human:(\S+)/);
    const peakMemoryMatch = info.match(/used_memory_peak_human:(\S+)/);

    const dbsize = await redis.dbsize();

    // Count keys by pattern without ever reading their values — this page must not leak
    // cached session/room data, only shapes of what's stored.
    const countPattern = async (pattern: string) => {
      let cursor = "0";
      let count = 0;
      do {
        const [next, keys] = await redis.scan(cursor, "MATCH", pattern, "COUNT", 500);
        cursor = next;
        count += keys.length;
      } while (cursor !== "0");
      return count;
    };

    const [roomCacheKeys, roomSeqKeys, rateLimitKeys, presenceKeys] = await Promise.all([
      countPattern("room_cache:*"),
      countPattern("room_seq:*"),
      countPattern("ratelimit:*"),
      countPattern("room:*:presence"),
    ]);

    const wsMetricsData = await fetchJson(`${WS_BACKEND_HTTP_URL}/metrics`);
    const hits = wsMetricsData?.cacheHits ?? null;
    const misses = wsMetricsData?.cacheMisses ?? null;
    const totalLookups = hits !== null && misses !== null ? hits + misses : null;

    res.json({
      memory: {
        usedBytes: usedMemoryMatch ? Number(usedMemoryMatch[1]) : null,
        usedHuman: usedMemoryHumanMatch?.[1] ?? null,
        peakHuman: peakMemoryMatch?.[1] ?? null,
      },
      dbsize,
      keysByPattern: {
        "room_cache:*": roomCacheKeys,
        "room_seq:*": roomSeqKeys,
        "ratelimit:*": rateLimitKeys,
        "room:*:presence": presenceKeys,
      },
      roomCache: {
        hits,
        misses,
        hitRatePct: totalLookups ? Number(((hits! / totalLookups) * 100).toFixed(1)) : null,
        note: "ws-backend's room_cache (the only reader of this key pattern), since it last started",
      },
    });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

// Kafka only creates a topic once something actually produces to it — canvas_events_dlq
// doesn't exist until the first message ever fails processing, which for a healthy
// system might be never. Every route below treats "topic doesn't exist" as a real,
// distinct state (worth showing as "0, never created" rather than an error).
async function listExistingTopics(admin: Awaited<ReturnType<typeof getKafkaAdmin>>): Promise<Set<string>> {
  return new Set(await admin.listTopics());
}

async function dlqStats(admin: Awaited<ReturnType<typeof getKafkaAdmin>>, existingTopics: Set<string>) {
  if (!existingTopics.has("canvas_events_dlq")) {
    return { topic: "canvas_events_dlq", exists: false, messageCount: 0 };
  }
  const dlqOffsets = await admin.fetchTopicOffsets("canvas_events_dlq");
  const messageCount = dlqOffsets.reduce((sum, p) => sum + (Number(p.offset) - Number(p.low ?? 0)), 0);
  return { topic: "canvas_events_dlq", exists: true, messageCount };
}

// ---- /kafka ------------------------------------------------------------------------
router.get("/kafka", async (_req, res) => {
  try {
    const admin = await getKafkaAdmin();
    const existingTopics = await listExistingTopics(admin);
    const topicsToDescribe = ["canvas_events", "canvas_events_dlq"].filter(t => existingTopics.has(t));

    const metadata = topicsToDescribe.length ? await admin.fetchTopicMetadata({ topics: topicsToDescribe }) : { topics: [] };
    const groupDescriptions = await admin.describeGroups(["canvas-group"]);
    const group = groupDescriptions.groups[0];

    let consumerLag: number | null = null;
    if (existingTopics.has("canvas_events")) {
      try {
        const topicOffsets = await admin.fetchTopicOffsets("canvas_events");
        const groupOffsets = await admin.fetchOffsets({ groupId: "canvas-group", topics: ["canvas_events"] });
        const groupTopicOffsets = groupOffsets.find(t => t.topic === "canvas_events")?.partitions ?? [];
        consumerLag = topicOffsets.reduce((sum, p) => {
          const committed = groupTopicOffsets.find(g => g.partition === p.partition);
          if (!committed) return sum;
          return sum + Math.max(0, Number(p.offset) - Number(committed.offset));
        }, 0);
      } catch {
        // group may not have committed offsets yet (fresh cluster) — leave lag as null
      }
    }

    res.json({
      topics: metadata.topics.map(t => ({
        name: t.name,
        partitions: t.partitions.length,
      })),
      consumerGroup: group ? {
        groupId: group.groupId,
        state: group.state,
        members: group.members.length,
        lag: consumerLag,
      } : { groupId: "canvas-group", state: "unknown", members: 0, lag: null },
      dlq: await dlqStats(admin, existingTopics),
    });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

// ---- /errors -----------------------------------------------------------------------
router.get("/errors", async (_req, res) => {
  const wsMetricsData = await fetchJson(`${WS_BACKEND_HTTP_URL}/metrics`);
  const workerMetricsData = await fetchJson(`${WORKER_METRICS_URL}/metrics`);

  let dlq: { topic: string; exists: boolean; messageCount: number } | null = null;
  try {
    const admin = await getKafkaAdmin();
    dlq = await dlqStats(admin, await listExistingTopics(admin));
  } catch {
    // Kafka unreachable — surfaced as null, not zero, so the UI can tell "no errors" apart
    // from "couldn't check."
  }

  res.json({
    http: { by4xx: httpMetrics.by4xx, by5xx: httpMetrics.by5xx },
    ws: { errorsSent: wsMetricsData?.errorsSent ?? null },
    worker: { eventsFailed: workerMetricsData?.eventsFailed ?? null },
    kafkaDlq: dlq,
  });
});

export default router;
