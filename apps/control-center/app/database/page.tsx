"use client";

import { usePoll, formatBytes, formatNumber } from "../../lib/api";
import { StatCard, Section, ErrorBanner, EmptyState, Bar } from "../components";

interface DatabaseData {
  tables: { users: number; rooms: number; chats: number; snapshots: number; viewers: number };
  sizeBytes: number;
  connections: { total: number; active: number; idle: number; max: number };
  slowQueries: { query: string; calls: number; meanMs: number; maxMs: number }[];
  slowQueriesAvailable: boolean;
}

export default function DatabasePage() {
  const { data, error } = usePoll<DatabaseData>("/database", 5000);
  const connPct = data && data.connections.max ? (data.connections.total / data.connections.max) * 100 : 0;

  return (
    <>
      <h1 className="page-title">PostgreSQL</h1>
      <p className="page-subtitle">Rooms, Chat (durable event log), and Snapshots — via Prisma against the live database.</p>

      {error && <ErrorBanner message={error} />}

      <div className="grid">
        <StatCard title="Database size" value={data ? formatBytes(data.sizeBytes) : "—"} />
        <StatCard title="Connections" value={data ? `${data.connections.total} / ${data.connections.max}` : "—"} sub={data ? `${data.connections.active} active · ${data.connections.idle} idle` : undefined} />
        <StatCard title="Rooms" value={formatNumber(data?.tables.rooms)} />
        <StatCard title="Chat events" value={formatNumber(data?.tables.chats)} sub="durable event log (Chat table)" />
        <StatCard title="Snapshots" value={formatNumber(data?.tables.snapshots)} />
        <StatCard title="Users" value={formatNumber(data?.tables.users)} />
      </div>

      {data && (
        <Section title="Connection pool">
          <Bar pct={connPct} />
          <div className="footnote">{data.connections.total} of {data.connections.max} max_connections in use ({connPct.toFixed(1)}%)</div>
        </Section>
      )}

      <Section title="Slowest queries (pg_stat_statements, by mean time)">
        {!data && !error && <EmptyState>Loading…</EmptyState>}
        {data && !data.slowQueriesAvailable && (
          <EmptyState>pg_stat_statements isn't loaded on this Postgres instance — no query timing available.</EmptyState>
        )}
        {data && data.slowQueriesAvailable && data.slowQueries.length === 0 && (
          <EmptyState>No queries recorded yet.</EmptyState>
        )}
        {data && data.slowQueriesAvailable && data.slowQueries.length > 0 && (
          <div className="scroll-x">
            <table>
              <thead>
                <tr><th>Query</th><th>Calls</th><th>Mean</th><th>Max</th></tr>
              </thead>
              <tbody>
                {data.slowQueries.map((q, i) => (
                  <tr key={i}>
                    <td style={{ maxWidth: 480, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }} title={q.query}>{q.query}</td>
                    <td>{q.calls}</td>
                    <td>{q.meanMs}ms</td>
                    <td>{q.maxMs}ms</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Section>
    </>
  );
}
