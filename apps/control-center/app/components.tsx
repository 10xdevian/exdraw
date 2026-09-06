"use client";

import React from "react";

export function StatCard({ title, value, sub, tone }: { title: string; value: string; sub?: string; tone?: "green" | "red" | "yellow" }) {
  const color = tone === "green" ? "#4ade80" : tone === "red" ? "#f87171" : tone === "yellow" ? "#fbbf24" : undefined;
  return (
    <div className="card">
      <div className="card-title">{title}</div>
      <div className="stat-value" style={color ? { color } : undefined}>{value}</div>
      {sub && <div className="stat-sub">{sub}</div>}
    </div>
  );
}

export function Section({ title, right, children }: { title: string; right?: React.ReactNode; children: React.ReactNode }) {
  return (
    <div className="section">
      <div className="section-title">
        <span>{title}</span>
        {right}
      </div>
      {children}
    </div>
  );
}

export function StatusBadge({ healthy, label }: { healthy: boolean | null; label?: string }) {
  const cls = healthy === null ? "neutral" : healthy ? "ok" : "bad";
  const text = label ?? (healthy === null ? "Unknown" : healthy ? "Healthy" : "Down");
  return (
    <span className={`badge ${cls}`}>
      <span className="badge-dot" />
      {text}
    </span>
  );
}

export function ErrorBanner({ message }: { message: string }) {
  return <div className="error-banner">Couldn't reach the backend for this page: {message}</div>;
}

export function EmptyState({ children }: { children: React.ReactNode }) {
  return <div className="empty-state">{children}</div>;
}

export function Bar({ pct }: { pct: number }) {
  return (
    <div className="bar-track">
      <div className="bar-fill" style={{ width: `${Math.min(100, Math.max(0, pct))}%` }} />
    </div>
  );
}
