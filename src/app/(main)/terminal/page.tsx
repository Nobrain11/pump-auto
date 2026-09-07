"use client";

import { useEffect, useState, useCallback } from "react";
import { BottomNav } from "@/components/layout/bottom-nav";
import { Brand } from "@/components/layout/brand";
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
  const [error, setError] = useState<string | null>(null);

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
    setError(null);
    try {
      const res = await fetch("/api/hunter", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: act }),
      });
      const data = await res.json();
      if (res.ok) {
        setStatus(data);
        setFeed((f) =>
          [
            `${new Date().toLocaleTimeString()}  ${act.toUpperCase()} → ${data.state || "ok"}`,
            ...f,
          ].slice(0, 24)
        );
      } else {
        setError(data.error || "Action failed");
        setFeed((f) =>
          [`${new Date().toLocaleTimeString()}  ERROR  ${data.error || "failed"}`, ...f].slice(0, 24)
        );
      }
    } finally {
      setLoading(false);
    }
  };

  const state = status?.state || "OFF";
  const isLive = !["OFF", "PAUSED", "RISK_HALTED", "ERROR"].includes(state);

  return (
    <main className="min-h-dvh flex flex-col pb-16">
      <header className="px-4 pt-4 pb-3 border-b border-[var(--card-border)] flex items-center justify-between gap-3">
        <Brand compact />
        <div className="flex-1">
          <p className="label">Live system</p>
          <h1 className="text-sm font-semibold text-white flex items-center gap-2">
            Terminal
            {isLive && <span className="dot dot-live pulse-dot" />}
          </h1>
        </div>
        <span className="text-[10px] mono text-[var(--muted)]">{state}</span>
      </header>

      <div className="flex-1 px-4 py-3 max-w-lg mx-auto w-full space-y-3">
        {error && (
          <div className="panel px-3 py-2 text-xs text-[var(--danger)] border-[var(--danger)]/30">
            {error}
          </div>
        )}

        <section className="panel p-3 space-y-3">
          <div className="flex justify-between items-start">
            <div>
              <p className="label">Auto-Hunter</p>
              <p className="text-xl mono font-semibold text-white">{state}</p>
            </div>
            <div className="text-right text-[10px] mono text-[var(--muted)] space-y-0.5">
              <p>Regime {status?.marketRegime || "—"}</p>
              <p>Risk {status?.dailyRiskUsedPct ?? 0}%</p>
            </div>
          </div>

          <div className="grid grid-cols-4 gap-1.5 text-center">
            {[
              ["Found", status?.opportunitiesFound ?? 0],
              ["Passed", status?.passedFilters ?? 0],
              ["Pos", status?.positions ?? 0],
              ["Today", status?.entriesToday ?? 0],
            ].map(([label, val]) => (
              <div key={String(label)} className="rounded bg-black/30 py-2">
                <p className="text-sm mono text-white">{val}</p>
                <p className="label">{label}</p>
              </div>
            ))}
          </div>

          <div className="flex flex-wrap gap-1.5">
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
              EMERGENCY
            </Button>
          </div>

          {status?.emergencyStop && (
            <div className="rounded border border-[var(--danger)]/40 bg-[var(--danger)]/10 px-2.5 py-2 text-[11px] text-[var(--danger)] flex justify-between items-center">
              <span>Emergency stop — new entries blocked</span>
              <button type="button" className="underline" onClick={() => action("clear_emergency")}>
                Clear
              </button>
            </div>
          )}
        </section>

        <section className="panel overflow-hidden">
          <div className="panel-header">Execution feed</div>
          <div className="p-3 font-mono text-[11px] space-y-1 max-h-64 overflow-y-auto min-h-[120px] bg-black/20">
            {feed.length === 0 && (
              <p className="text-[var(--muted)]">Waiting for commands and system events…</p>
            )}
            {feed.map((line, i) => (
              <p key={i} className="text-[var(--primary)] leading-relaxed">{line}</p>
            ))}
          </div>
        </section>

        <p className="text-[10px] text-[var(--muted)] text-center leading-relaxed px-2">
          Emergency stop blocks new automated entries only. Positions and funds are not sold or withdrawn.
        </p>
      </div>

      <BottomNav />
    </main>
  );
}
