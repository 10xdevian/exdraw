"use client";

import { usePoll, formatUptime, formatNumber } from "../../lib/api";
import { Section, StatusBadge, ErrorBanner, EmptyState } from "../components";

interface ServiceRow {
  name: string;
  healthy: boolean;
  uptimeMs: number | null;
  metrics: Record<string, number | null> | null;
}

const METRIC_LABELS: Record<string, string> = {
  totalRequests: "Requests",
  by2xx: "2xx",
  by4xx: "4xx",
  by5xx: "5xx",
  connections: "Connections",
  messagesProcessed: "Messages processed",
  errorsSent: "Errors sent",
  cacheHits: "Room-cache hits",
  cacheMisses: "Room-cache misses",
  eventsProcessed: "Events processed",
  eventsFailed: "Events failed",
  snapshotsCreated: "Snapshots created",
};

export default function ServicesPage() {
  const { data, error } = usePoll<ServiceRow[]>("/services", 4000);

  return (
    <>
      <h1 className="page-title">Services</h1>
      <p className="page-subtitle">http-backend, ws-backend, and worker — each polled directly on its own /health and /metrics.</p>

      {error && <ErrorBanner message={error} />}

      {!data && !error && <EmptyState>Loading…</EmptyState>}

      {data?.map(svc => (
        <Section
          key={svc.name}
          title={svc.name}
          right={<StatusBadge healthy={svc.healthy} />}
        >
          <table>
            <tbody>
              <tr><td style={{ color: "var(--text-dim)", fontFamily: "inherit" }}>Uptime</td><td>{formatUptime(svc.uptimeMs)}</td></tr>
              {svc.metrics && Object.entries(svc.metrics).map(([key, value]) => (
                <tr key={key}>
                  <td style={{ color: "var(--text-dim)", fontFamily: "inherit" }}>{METRIC_LABELS[key] ?? key}</td>
                  <td>{formatNumber(value)}</td>
                </tr>
              ))}
              {!svc.metrics && (
                <tr><td colSpan={2} style={{ color: "var(--text-faint)", fontFamily: "inherit" }}>No metrics available — service unreachable.</td></tr>
              )}
            </tbody>
          </table>
        </Section>
      ))}
    </>
  );
}
