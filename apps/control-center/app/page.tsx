"use client";

import { usePoll, formatUptime, formatNumber } from "../lib/api";
import { StatCard, Section, StatusBadge, ErrorBanner } from "./components";

interface Overview {
  services: {
    httpBackend: { healthy: boolean };
    wsBackend: { healthy: boolean; connections: number | null };
    worker: { healthy: boolean };
  };
  http: {
    uptimeMs: number;
    totalRequests: number;
    requestsSince: string;
    by2xx: number;
    by4xx: number;
    by5xx: number;
    errorRatePct: number;
  };
  domain: { roomCount: number; chatCount: number; userCount: number };
}

export default function OverviewPage() {
  const { data, error } = usePoll<Overview>("/overview", 4000);

  const healthyCount = data ? [data.services.httpBackend.healthy, data.services.wsBackend.healthy, data.services.worker.healthy].filter(Boolean).length : 0;
  const allHealthy = data && healthyCount === 3;

  return (
    <>
      <h1 className="page-title">Production Overview</h1>
      <p className="page-subtitle">Real-time collaborative canvas platform — http-backend, ws-backend, worker, Postgres, Redis, Kafka.</p>

      {error && <ErrorBanner message={error} />}

      {data && (
        <div style={{ marginBottom: 20 }}>
          <StatusBadge
            healthy={allHealthy}
            label={data ? `${healthyCount}/3 services healthy` : undefined}
          />
        </div>
      )}

      <div className="grid">
        <StatCard title="Total Requests" value={formatNumber(data?.http.totalRequests)} sub="since process start" />
        <StatCard title="2xx" value={formatNumber(data?.http.by2xx)} tone="green" />
        <StatCard title="4xx" value={formatNumber(data?.http.by4xx)} tone={data && data.http.by4xx > 0 ? "yellow" : undefined} />
        <StatCard title="5xx" value={formatNumber(data?.http.by5xx)} tone={data && data.http.by5xx > 0 ? "red" : undefined} />
        <StatCard
          title="Error Rate"
          value={data ? `${data.http.errorRatePct}%` : "—"}
          tone={data && data.http.errorRatePct > 1 ? "red" : "green"}
        />
        <StatCard title="WS Connections" value={formatNumber(data?.services.wsBackend.connections)} sub="live" />
      </div>

      <Section title="Services">
        <table>
          <thead>
            <tr><th>Service</th><th>Status</th></tr>
          </thead>
          <tbody>
            <tr><td>http-backend</td><td><StatusBadge healthy={data?.services.httpBackend.healthy ?? null} /></td></tr>
            <tr><td>ws-backend</td><td><StatusBadge healthy={data?.services.wsBackend.healthy ?? null} /></td></tr>
            <tr><td>worker</td><td><StatusBadge healthy={data?.services.worker.healthy ?? null} /></td></tr>
          </tbody>
        </table>
        <div className="footnote">Detailed per-service throughput and error counts on the Services page.</div>
      </Section>

      <div className="two-col">
        <Section title="Domain data">
          <table>
            <tbody>
              <tr><td>Rooms</td><td>{formatNumber(data?.domain.roomCount)}</td></tr>
              <tr><td>Chat events (durable)</td><td>{formatNumber(data?.domain.chatCount)}</td></tr>
              <tr><td>Users</td><td>{formatNumber(data?.domain.userCount)}</td></tr>
            </tbody>
          </table>
        </Section>
        <Section title="This process">
          <table>
            <tbody>
              <tr><td>http-backend uptime</td><td>{formatUptime(data?.http.uptimeMs)}</td></tr>
              <tr><td>Counters reset</td><td>on process restart</td></tr>
            </tbody>
          </table>
        </Section>
      </div>
    </>
  );
}
