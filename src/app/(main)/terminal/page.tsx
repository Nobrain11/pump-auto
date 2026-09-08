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
  const [entered, setEntered] = useState(false);
  const [status, setStatus] = useState<HunterStatus | null>(null);
  const [loading, setLoading] = useState(false);
  const [feed, setFeed] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    try {
      if (sessionStorage.getItem("pump_terminal_entered") === "1") setEntered(true);
    } catch {
      /* */
    }
  }, []);

  const enterTerminal = () => {
    setEntered(true);
    try {
      sessionStorage.setItem("pump_terminal_entered", "1");
    } catch {
      /* */
    }
  };

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/hunter");
      setStatus(await res.json());
    } catch {
      setStatus(null);
    }
  }, []);

  useEffect(() => {
    if (!entered) return;
    load();
    const t = setInterval(load, 4000);
    return () => clearInterval(t);
  }, [entered, load]);

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
          [`${new Date().toLocaleTimeString()}  ${act.toUpperCase()} → ${data.state || "ok"}`, ...f].slice(0, 24)
        );
      } else {
        setError(data.error || "Action failed");
      }
    } finally {
      setLoading(false);
    }
  };

  const state = status?.state || "OFF";
  const isLive = !["OFF", "PAUSED", "RISK_HALTED", "ERROR"].includes(state);

  if (!entered) {
    return (
      <main className="min-h-dvh flex flex-col pb-16 relative overflow-hidden">
        <div className="hero-glow" aria-hidden />
        <div className="flex-1 flex flex-col justify-center px-5 max-w-md mx-auto w-full space-y-6 relative z-10">
          <div className="animate-fade-up">
            <Brand />
          </div>
          <div className="space-y-3 animate-fade-up-delay-1">
            <span className="hero-tag">
              <span className="dot dot-live pulse-dot" />
              Control deck
            </span>
            <h1 className="hero-title">
              Auto-Hunter
              <br />
              terminal
            </h1>
            <p className="hero-sub">
              Live control surface for automated entries. Start the hunter, watch
              filters run, and manage risk. The worker executes only risk-approved
              orders on Solana.
            </p>
          </div>
          <div className="panel p-3 space-y-2 text-[11px] mono text-[var(--muted)] animate-fade-up-delay-2">
            <p className="flex justify-between">
              <span>Scan</span>
              <span className="text-white">Pump.fun movers</span>
            </p>
            <p className="flex justify-between">
              <span>Filter</span>
              <span className="text-white">Score · liquidity · risk</span>
            </p>
            <p className="flex justify-between">
              <span>Execute</span>
              <span className="text-white">Jupiter → Solana</span>
            </p>
            <p className="flex justify-between">
              <span>Stop</span>
              <span className="text-[var(--warning)]">Emergency blocks new entries</span>
            </p>
          </div>
          <div className="animate-fade-up-delay-3 space-y-2">
            <Button size="lg" className="btn-shine" onClick={enterTerminal}>
              Enter terminal
            </Button>
            <p className="text-center text-[10px] mono text-[var(--muted)] tracking-wider">
              FUND · HUNT · TRADE
            </p>
          </div>
        </div>
        <BottomNav />
      </main>
    );
  }

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

      <div className="flex-1 px-4 py-3 max-w-lg mx-auto w-full space-y-3 animate-fade-in">
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
            <div className="text-right text-[10px] mono text-[var(--muted)]">
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

          <div className="grid grid-cols-2 gap-2">
            {!isLive ? (
              <Button
                size="md"
                className="btn-shine col-span-2"
                disabled={loading || status?.emergencyStop}
                onClick={() => action("start")}
              >
                START HUNTER
              </Button>
            ) : (
              <>
                <Button size="md" variant="secondary" disabled={loading} onClick={() => action("pause")}>
                  PAUSE
                </Button>
                <Button size="md" variant="danger" disabled={loading} onClick={() => action("stop")}>
                  STOP
                </Button>
              </>
            )}
          </div>

          {status?.emergencyStop ? (
            <Button size="sm" variant="outline" className="w-full" onClick={() => action("clear_emergency")}>
              Clear emergency stop
            </Button>
          ) : (
            <Button size="sm" variant="danger" className="w-full" onClick={() => action("emergency_stop")}>
              Emergency stop
            </Button>
          )}
        </section>

        <section className="panel overflow-hidden">
          <div className="panel-header">Activity feed</div>
          <div className="max-h-48 overflow-y-auto divide-y divide-[var(--border-subtle)]">
            {feed.length === 0 && (
              <p className="px-3 py-4 text-[11px] text-[var(--muted)] text-center">
                Actions appear here.
              </p>
            )}
            {feed.map((line, i) => (
              <p key={i} className="px-3 py-1.5 text-[11px] mono text-white">
                {line}
              </p>
            ))}
          </div>
        </section>
      </div>

      <BottomNav />
    </main>
  );
}
