"use client";

import { useEffect, useState } from "react";
import { BACKEND_URL } from "@repo/shared";

const BASE = `${BACKEND_URL}/control-center`;

export interface FetchState<T> {
  data: T | null;
  error: string | null;
  loading: boolean;
}

// Polls a control-center endpoint every `intervalMs` and keeps the last successful
// response on screen if a poll fails, rather than flashing the page to an error state —
// a transient blip in one poll shouldn't nuke a live dashboard.
export function usePoll<T>(path: string, intervalMs = 4000): FetchState<T> {
  const [state, setState] = useState<FetchState<T>>({ data: null, error: null, loading: true });

  useEffect(() => {
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout>;

    const tick = async () => {
      try {
        const res = await fetch(`${BASE}${path}`, { cache: "no-store" });
        if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);
        const data = await res.json();
        if (!cancelled) setState({ data, error: null, loading: false });
      } catch (e: any) {
        if (!cancelled) setState(s => ({ ...s, error: e.message || "Request failed", loading: false }));
      } finally {
        if (!cancelled) timer = setTimeout(tick, intervalMs);
      }
    };

    tick();
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [path, intervalMs]);

  return state;
}

export function formatBytes(bytes: number | null | undefined): string {
  if (bytes === null || bytes === undefined) return "—";
  if (bytes === 0) return "0 B";
  const units = ["B", "KB", "MB", "GB", "TB"];
  const i = Math.min(units.length - 1, Math.floor(Math.log(bytes) / Math.log(1024)));
  return `${(bytes / Math.pow(1024, i)).toFixed(i === 0 ? 0 : 2)} ${units[i]}`;
}

export function formatUptime(ms: number | null | undefined): string {
  if (ms === null || ms === undefined) return "—";
  const s = Math.floor(ms / 1000);
  const d = Math.floor(s / 86400);
  const h = Math.floor((s % 86400) / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  if (d > 0) return `${d}d ${h}h`;
  if (h > 0) return `${h}h ${m}m`;
  if (m > 0) return `${m}m ${sec}s`;
  return `${sec}s`;
}

export function formatNumber(n: number | null | undefined): string {
  if (n === null || n === undefined) return "—";
  return n.toLocaleString();
}
