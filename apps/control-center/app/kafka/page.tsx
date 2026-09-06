"use client";

import { usePoll, formatNumber } from "../../lib/api";
import { StatCard, Section, StatusBadge, ErrorBanner, EmptyState } from "../components";

interface KafkaData {
  topics: { name: string; partitions: number }[];
  consumerGroup: { groupId: string; state: string; members: number; lag: number | null };
  dlq: { topic: string; exists: boolean; messageCount: number };
}

export default function KafkaPage() {
  const { data, error } = usePoll<KafkaData>("/kafka", 5000);
  const groupHealthy = data ? data.consumerGroup.state === "Stable" && data.consumerGroup.members > 0 : null;

  return (
    <>
      <h1 className="page-title">Kafka</h1>
      <p className="page-subtitle">The durable event pipeline: ws-backend produces to canvas_events; worker consumes as group "canvas-group" and persists to Postgres.</p>

      {error && <ErrorBanner message={error} />}
      {!data && !error && <EmptyState>Loading…</EmptyState>}

      <div className="grid">
        <StatCard
          title="Consumer group"
          value={data?.consumerGroup.state ?? "—"}
          sub={data ? `${data.consumerGroup.members} member(s)` : undefined}
          tone={groupHealthy === null ? undefined : groupHealthy ? "green" : "red"}
        />
        <StatCard
          title="Consumer lag"
          value={data?.consumerGroup.lag !== null && data?.consumerGroup.lag !== undefined ? formatNumber(data.consumerGroup.lag) : "—"}
          sub="messages behind latest offset"
          tone={data && data.consumerGroup.lag !== null ? (data.consumerGroup.lag > 100 ? "red" : data.consumerGroup.lag > 10 ? "yellow" : "green") : undefined}
        />
        <StatCard
          title="Dead-letter queue"
          value={data ? formatNumber(data.dlq.messageCount) : "—"}
          sub={data && !data.dlq.exists ? "topic never created — no message has ever failed" : undefined}
          tone={data && data.dlq.messageCount > 0 ? "red" : "green"}
        />
      </div>

      {data && (
        <Section title="Topics">
          <table>
            <thead><tr><th>Topic</th><th>Partitions</th></tr></thead>
            <tbody>
              {data.topics.map(t => (
                <tr key={t.name}><td>{t.name}</td><td>{t.partitions}</td></tr>
              ))}
              {data.topics.length === 0 && (
                <tr><td colSpan={2} style={{ color: "var(--text-faint)" }}>No topics exist yet.</td></tr>
              )}
            </tbody>
          </table>
        </Section>
      )}

      {data && (
        <Section title="canvas-group" right={<StatusBadge healthy={groupHealthy} label={data.consumerGroup.state} />}>
          <table>
            <tbody>
              <tr><td>Group ID</td><td>{data.consumerGroup.groupId}</td></tr>
              <tr><td>Members</td><td>{data.consumerGroup.members}</td></tr>
              <tr><td>Lag</td><td>{data.consumerGroup.lag ?? "unknown (no committed offsets yet)"}</td></tr>
            </tbody>
          </table>
        </Section>
      )}
    </>
  );
}
