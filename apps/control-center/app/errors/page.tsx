"use client";

import { usePoll, formatNumber } from "../../lib/api";
import { StatCard, Section, ErrorBanner, EmptyState } from "../components";

interface ErrorsData {
  http: { by4xx: number; by5xx: number };
  ws: { errorsSent: number | null };
  worker: { eventsFailed: number | null };
  kafkaDlq: { topic: string; exists: boolean; messageCount: number } | null;
}

export default function ErrorsPage() {
  const { data, error } = usePoll<ErrorsData>("/errors", 4000);
  const total = data ? data.http.by4xx + data.http.by5xx + (data.ws.errorsSent ?? 0) + (data.worker.eventsFailed ?? 0) : null;

  return (
    <>
      <h1 className="page-title">Errors</h1>
      <p className="page-subtitle">Every error surface this system currently tracks — HTTP status codes, WS error messages, failed Kafka events, and the dead-letter queue.</p>

      {error && <ErrorBanner message={error} />}

      <div className="grid">
        <StatCard title="Total (this pass)" value={formatNumber(total)} tone={total !== null && total > 0 ? "yellow" : "green"} />
        <StatCard title="HTTP 4xx" value={formatNumber(data?.http.by4xx)} />
        <StatCard title="HTTP 5xx" value={formatNumber(data?.http.by5xx)} tone={data && data.http.by5xx > 0 ? "red" : undefined} />
        <StatCard title="WS errors sent" value={formatNumber(data?.ws.errorsSent)} />
        <StatCard title="Worker events failed" value={formatNumber(data?.worker.eventsFailed)} tone={data && (data.worker.eventsFailed ?? 0) > 0 ? "red" : undefined} />
        <StatCard
          title="Kafka DLQ"
          value={data?.kafkaDlq ? formatNumber(data.kafkaDlq.messageCount) : "—"}
          sub={data?.kafkaDlq && !data.kafkaDlq.exists ? "never created" : undefined}
        />
      </div>

      {data && total === 0 && (
        <Section title="System status">
          <EmptyState>No errors recorded across HTTP, WebSocket, or the Kafka pipeline since these processes last started.</EmptyState>
        </Section>
      )}

      <div className="footnote" style={{ marginTop: -8 }}>
        Counts are in-process, since each service last started — not a durable error log. A structured, queryable error log (with request correlation via eventId) is the natural next step here.
      </div>
    </>
  );
}
