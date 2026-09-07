"use client";

import { useEffect, useState, useCallback } from "react";
import { BottomNav } from "@/components/layout/bottom-nav";
import { Button } from "@/components/ui/button";

interface HunterStatus {
  state: string;
  startedAt: string | null;
  opportunitiesFound: number;
  passedFilters: number;
  positions: number;
  entriesToday: number;
  dailyRiskUsedPct: number;
  marketRegime: string;
  emergencyStop: boolean;
  note?: string;
}

export default function TerminalPage() {
  const [status, setStatus] = useState<HunterStatus | null>(null);
  const [loading, setLoading] = useState(false);
  const [feed, setFeed] = useState<string[]>([]);

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/hunter");
      const data = await res.json();
      setStatus(data);
    } catch {
      setStatus(null);
    }
  }, []);

  useEffect(() => {
    load();
    const t = setInterval(load, 4000);
    return () => clearInterval(t);
  }, [load]);

  const action = async (act: string) => {
    setLoading(true);
    try {
      const res = await fetch("/api/hunter", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: act }),
      });
      const data = await res.json();
      if (res.ok) {
        setStatus(data);
        setFeed((f) => [`${new Date().toLocaleTimeString()} · ${act.toUpperCase()} → ${data.state}`, ...f].slice(0, 20));
      } else {
        setFeed((f) => [`${new Date().toLocaleTimeString()} · ERROR: ${data.error}`, ...f].slice(0, 20));
      }
    } finally {
      setLoading(false);
    }
  };

  const state = status?.state || "OFF";
  const isLive = !["OFF", "PAUSED", "RISK_HALTED", "ERROR"].includes(state);

  return (
    <main className="min-h-dvh flex flex-col pb-20">
      <header className="px-5 pt-6 pb-4 border-b border-[var(--card-border)]">
        <p className="text-[10px] font-mono tracking-widest text-[var(--muted)] uppercase">
          Live System
        </p>
        <h1 className="text-lg font-bold text-white flex items-center gap-2">
          Terminal
          {isLive && <span className="w-2 h-2 rounded-full bg-[var(--primary)] pulse-dot" />}
        </h1>
      </header>

      <div className="flex-1 px-5 py-5 max-w-lg mx-auto w-full space-y-5">
        <div className="rounded-2xl border border-[var(--card-border)] bg-[var(--card)] p-5 space-y-4">
          <div className="flex justify-between items-center">
            <div>
              <p className="text-[10px] font-mono text-[var(--muted)] uppercase">Auto-Hunter</p>
              <p className="text-2xl font-bold text-white font-mono">{state}</p>
            </div>
            <div className="text-right text-xs text-[var(--muted)] font-mono">
              <p>Regime: {status?.marketRegime || "—"}</p>
              <p>Risk used: {status?.dailyRiskUsedPct ?? 0}%</p>
            </div>
          </div>

          <div className="grid grid-cols-4 gap-2 text-center">
            {[
              ["Found", status?.opportunitiesFound ?? 0],
              ["Passed", status?.passedFilters ?? 0],
              ["Positions", status?.positions ?? 0],
              ["Today", status?.entriesToday ?? 0],
            ].map(([label, val]) => (
              <div key={String(label)} className="rounded-lg bg-black/30 py-2">
                <p className="text-sm font-mono text-white">{val}</p>
                <p className="text-[9px] text-[var(--muted)]">{label}</p>
              </div>
            ))}
          </div>

          <div className="flex flex-wrap gap-2">
            {!isLive ? (
              <Button size="sm" onClick={() => action("start")} disabled={loading || status?.emergencyStop}>
                START
              </Button>
            ) : (
              <>
                <Button size="sm" variant="secondary" onClick={() => action("pause")} disabled={loading}>
                  PAUSE
                </Button>
                <Button size="sm" variant="secondary" onClick={() => action("stop")} disabled={loading}>
                  STOP
                </Button>
              </>
            )}
            {state === "PAUSED" && (
              <Button size="sm" onClick={() => action("resume")} disabled={loading}>
                RESUME
              </Button>
            )}
            <Button size="sm" variant="danger" onClick={() => action("emergency_stop")} disabled={loading}>
              EMERGENCY STOP
            </Button>
          </div>

          {status?.emergencyStop && (
            <div className="rounded-lg border border-[var(--danger)]/40 bg-[var(--danger)]/10 px-3 py-2 text-xs text-[var(--danger)]">
              Emergency stop active.{" "}
              <button className="underline" onClick={() => action("clear_emergency")}>
                Clear
              </button>
            </div>
          )}
        </div>

        <div className="rounded-2xl border border-[var(--card-border)] bg-black/40 p-4 font-mono text-[11px] space-y-1 max-h-64 overflow-y-auto">
          <p className="text-[var(--muted)] mb-2">● ACTIVITY FEED</p>
          {feed.length === 0 && (
            <p className="text-[var(--muted)]">Waiting for system events…</p>
          )}
          {feed.map((line, i) => (
            <p key={i} className="text-[var(--accent)]">{line}</p>
          ))}
        </div>

        <p className="text-[10px] text-[var(--muted)] text-center">
          Emergency stop blocks new entries only. Does not sell positions or withdraw funds.
        </p>
      </div>

      <BottomNav />
    </main>
  );
}
