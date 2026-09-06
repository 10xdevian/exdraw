"use client";

import { usePoll, formatNumber } from "../../lib/api";
import { StatCard, Section, ErrorBanner, EmptyState } from "../components";

interface RedisData {
  memory: { usedBytes: number | null; usedHuman: string | null; peakHuman: string | null };
  dbsize: number;
  keysByPattern: Record<string, number>;
  roomCache: { hits: number | null; misses: number | null; hitRatePct: number | null; note: string };
}

export default function RedisPage() {
  const { data, error } = usePoll<RedisData>("/redis", 4000);

  return (
    <>
      <h1 className="page-title">Redis</h1>
      <p className="page-subtitle">Room-lookup cache, room-scoped sequence counters, presence, and rate limiting.</p>

      {error && <ErrorBanner message={error} />}
      {!data && !error && <EmptyState>Loading…</EmptyState>}

      <div className="grid">
        <StatCard title="Memory used" value={data?.memory.usedHuman ?? "—"} sub={data?.memory.peakHuman ? `peak ${data.memory.peakHuman}` : undefined} />
        <StatCard title="Total keys" value={formatNumber(data?.dbsize)} />
        <StatCard
          title="Room-cache hit rate"
          value={data?.roomCache.hitRatePct !== null && data?.roomCache.hitRatePct !== undefined ? `${data.roomCache.hitRatePct}%` : "—"}
          sub={data ? `${formatNumber(data.roomCache.hits)} hits / ${formatNumber(data.roomCache.misses)} misses` : undefined}
          tone={data?.roomCache.hitRatePct !== null && data?.roomCache.hitRatePct !== undefined ? (data.roomCache.hitRatePct > 80 ? "green" : "yellow") : undefined}
        />
      </div>

      {data && (
        <Section title="Keys by pattern">
          <table>
            <thead><tr><th>Pattern</th><th>Count</th></tr></thead>
            <tbody>
              {Object.entries(data.keysByPattern).map(([pattern, count]) => (
                <tr key={pattern}><td>{pattern}</td><td>{count}</td></tr>
              ))}
            </tbody>
          </table>
          <div className="footnote">Counts only — key contents are never read or displayed here.</div>
        </Section>
      )}

      {data && (
        <Section title="Room-lookup cache">
          <p style={{ fontSize: 13, color: "var(--text-dim)", margin: "0 0 4px" }}>{data.roomCache.note}</p>
        </Section>
      )}
    </>
  );
}
