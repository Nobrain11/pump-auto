"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Activity, AlertTriangle, ArrowUpRight, BarChart3, Bot, ChevronRight, CircleHelp, Gauge, Pause, Play, Radio, RefreshCw, ShieldCheck, Square, Wallet, Zap } from "lucide-react";
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

interface PortfolioData {
  totalSol: number;
  realizedPnlSol: number;
  unrealizedPnlSol: number;
  exposureSol: number;
  positionCount: number;
  positions: Array<{ id: string; mint: string; entryAmountSol: number; unrealizedPnlSol: number; status: string }>;
  note?: string;
}

interface ActivityEvent {
  id: string;
  type: string;
  message: string;
  severity: string;
  timestamp: string;
}

const stateLabels: Record<string, string> = {
  OFF: "OFFLINE",
  STARTING: "STARTING",
  SCANNING: "SCANNING",
  ANALYZING: "ANALYZING",
  READY: "READY",
  EXECUTING: "EXECUTING",
  MONITORING: "MONITORING",
  PAUSED: "PAUSED",
  RISK_HALTED: "RISK HALTED",
  ERROR: "ERROR",
};

function formatSol(value: number | null | undefined) {
  return value === null || value === undefined ? "—" : `${value.toFixed(3)} SOL`;
}

function timeLabel(value: string) {
  return new Intl.DateTimeFormat("en", { hour: "2-digit", minute: "2-digit" }).format(new Date(value));
}

export default function TerminalPage() {
  const [status, setStatus] = useState<HunterStatus | null>(null);
  const [portfolio, setPortfolio] = useState<PortfolioData | null>(null);
  const [events, setEvents] = useState<ActivityEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const [hunterRes, portfolioRes, activityRes] = await Promise.all([
        fetch("/api/hunter", { cache: "no-store" }),
        fetch("/api/portfolio", { cache: "no-store" }),
        fetch("/api/activity", { cache: "no-store" }),
      ]);
      const [hunter, portfolioData, activity] = await Promise.all([hunterRes.json(), portfolioRes.json(), activityRes.json()]);
      if (!hunterRes.ok) throw new Error(hunter.error || "Hunter unavailable");
      setStatus(hunter);
      setPortfolio(portfolioData);
      setEvents(activity.events ?? []);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to reach the trading services.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
    const timer = setInterval(load, 5000);
    return () => clearInterval(timer);
  }, [load]);

  const action = async (nextAction: "start" | "pause" | "stop" | "resume" | "emergency_stop" | "clear_emergency") => {
    if (nextAction === "emergency_stop" && !window.confirm("Emergency stop will block new automated entries. Existing positions will remain open. Continue?")) return;
    setActionLoading(true);
    try {
      const response = await fetch("/api/hunter", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: nextAction }) });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Hunter action failed");
      setStatus(data);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Hunter action failed.");
    } finally {
      setActionLoading(false);
    }
  };

  const state = status?.state ?? "OFF";
  const live = ["SCANNING", "ANALYZING", "READY", "EXECUTING", "MONITORING"].includes(state);
  const databaseUnavailable = Boolean(portfolio?.note || events.length === 0 && !loading);
  const latestEvent = events[0];
  const risk = status?.dailyRiskUsedPct;

  const metrics = useMemo(() => [
    { label: "Wallet balance", value: portfolio ? formatSol(portfolio.totalSol) : "—", icon: Wallet },
    { label: "Exposure", value: portfolio ? formatSol(portfolio.exposureSol) : "—", icon: BarChart3 },
    { label: "Unrealized PnL", value: portfolio ? formatSol(portfolio.unrealizedPnlSol) : "—", icon: ArrowUpRight },
    { label: "Positions", value: portfolio ? String(portfolio.positionCount) : "—", icon: Gauge },
  ], [portfolio]);

  return (
    <main className="min-h-dvh bg-background pb-24 text-foreground lg:pb-8">
      <header className="border-b border-card-border bg-card/80 backdrop-blur-xl">
        <div className="mx-auto flex max-w-[1480px] items-center justify-between gap-4 px-4 py-4 sm:px-6 lg:px-8">
          <div className="flex items-center gap-3">
            <div className="flex size-9 items-center justify-center rounded-lg bg-primary text-primary-foreground"><Zap className="size-4" /></div>
            <div>
              <p className="font-mono text-[10px] uppercase tracking-[0.24em] text-muted">Pump Auto / Terminal</p>
              <h1 className="text-lg font-semibold tracking-tight">Operator console</h1>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <div className="hidden items-center gap-2 rounded-full border border-card-border px-3 py-1.5 font-mono text-[10px] text-muted sm:flex"><span className={`size-1.5 rounded-full ${error ? "bg-danger" : "bg-primary pulse-dot"}`} />{error ? "SERVICE ERROR" : "RAILWAY / LIVE"}</div>
            <Button variant="danger" size="sm" onClick={() => action("emergency_stop")} disabled={actionLoading || status?.emergencyStop}><AlertTriangle data-icon="inline-start" />Emergency stop</Button>
          </div>
        </div>
      </header>

      <div className="mx-auto flex max-w-[1480px] flex-col gap-5 px-4 py-5 sm:px-6 lg:px-8">
        {error && <div className="flex items-center justify-between gap-4 rounded-xl border border-danger/30 bg-danger/10 px-4 py-3 text-sm text-danger"><span>{error}</span><Button variant="ghost" size="sm" onClick={load}><RefreshCw data-icon="inline-start" />Retry</Button></div>}

        <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          {metrics.map(({ label, value, icon: Icon }) => <div key={label} className="rounded-xl border border-card-border bg-card p-4"><div className="mb-5 flex items-center justify-between text-muted"><span className="text-xs">{label}</span><Icon className="size-4" /></div><p className="font-mono text-xl font-medium tracking-tight">{loading ? "..." : value}</p></div>)}
        </section>

        <section className="grid gap-5 xl:grid-cols-[1.35fr_1fr]">
          <div className="rounded-xl border border-card-border bg-card">
            <div className="flex flex-wrap items-start justify-between gap-4 border-b border-card-border p-5"><div><div className="mb-2 flex items-center gap-2 text-xs text-muted"><Bot className="size-4 text-primary" />Strategy / Auto-Hunter</div><div className="flex items-center gap-3"><h2 className="font-mono text-2xl font-semibold">{stateLabels[state] ?? state}</h2><span className={`rounded-full px-2 py-1 font-mono text-[10px] ${live ? "bg-primary/15 text-primary" : status?.emergencyStop ? "bg-danger/15 text-danger" : "bg-muted/15 text-muted"}`}>{status?.emergencyStop ? "NEW ENTRIES BLOCKED" : live ? "ACTIVE" : "IDLE"}</span></div></div><div className="text-right font-mono text-xs text-muted"><p>Market regime</p><p className="mt-1 text-foreground">{status?.marketRegime ?? "—"}</p></div></div>
            <div className="grid grid-cols-2 gap-px bg-card-border sm:grid-cols-4">{[["Detected", status?.opportunitiesFound], ["Passed filters", status?.passedFilters], ["Entries today", status?.entriesToday], ["Risk used", risk === undefined ? undefined : `${risk}%`]].map(([label, value]) => <div key={String(label)} className="bg-card p-4"><p className="font-mono text-lg">{value ?? "—"}</p><p className="mt-1 text-xs text-muted">{label}</p></div>)}</div>
            <div className="flex flex-wrap gap-2 p-5"><Button onClick={() => action(live ? "pause" : state === "PAUSED" ? "resume" : "start")} disabled={actionLoading || status?.emergencyStop}>{live ? <Pause data-icon="inline-start" /> : state === "PAUSED" ? <Play data-icon="inline-start" /> : <Radio data-icon="inline-start" />}{live ? "Pause hunting" : state === "PAUSED" ? "Resume hunting" : "Start hunting"}</Button>{live && <Button variant="secondary" onClick={() => action("stop")} disabled={actionLoading}><Square data-icon="inline-start" />Stop</Button>}{status?.emergencyStop && <Button variant="secondary" onClick={() => action("clear_emergency")} disabled={actionLoading}>Clear emergency stop</Button>}</div>
            <div className="border-t border-card-border px-5 py-3 text-xs text-muted">Emergency stop blocks automated entries only. Existing positions remain open and available for manual management.</div>
          </div>

          <div className="rounded-xl border border-card-border bg-card"><div className="flex items-center justify-between border-b border-card-border p-5"><div><p className="flex items-center gap-2 text-xs text-muted"><ShieldCheck className="size-4 text-primary" />Risk engine</p><h2 className="mt-2 text-lg font-semibold">Guardrails</h2></div><ChevronRight className="size-4 text-muted" /></div><div className="flex flex-col gap-4 p-5"><div><div className="mb-2 flex justify-between text-xs"><span className="text-muted">Daily risk usage</span><span className="font-mono">{risk === undefined ? "—" : `${risk}%`}</span></div><div className="h-2 overflow-hidden rounded-full bg-background"><div className="h-full rounded-full bg-primary transition-all" style={{ width: `${Math.min(risk ?? 0, 100)}%` }} /></div></div>{["Daily loss cap", "Maximum exposure", "Duplicate protection", "Emergency state"].map((item) => <div key={item} className="flex items-center justify-between border-t border-card-border pt-3 text-sm"><span className="text-muted">{item}</span><span className="flex items-center gap-1.5 font-mono text-xs text-primary"><ShieldCheck className="size-3" />{status ? item === "Emergency state" && status.emergencyStop ? "BLOCKED" : "READY" : "—"}</span></div>)}</div></div>
        </section>

        <section className="grid gap-5 lg:grid-cols-[1fr_1.2fr]">
          <div className="rounded-xl border border-card-border bg-card"><div className="flex items-center justify-between border-b border-card-border p-5"><div><p className="flex items-center gap-2 text-xs text-muted"><Activity className="size-4 text-accent" />System narration</p><h2 className="mt-2 text-lg font-semibold">Activity stream</h2></div><Button variant="ghost" size="sm" onClick={load}><RefreshCw data-icon="inline-start" />Refresh</Button></div><div className="flex max-h-[340px] flex-col overflow-y-auto">{latestEvent ? events.map((event) => <div key={event.id} className="flex gap-3 border-b border-card-border px-5 py-4 last:border-0"><div className="mt-1 size-2 shrink-0 rounded-full bg-primary" /><div className="min-w-0 flex-1"><p className="text-sm">{event.message}</p><p className="mt-1 font-mono text-[10px] uppercase tracking-wider text-muted">{event.type.replaceAll("_", " ")} · {timeLabel(event.timestamp)}</p></div></div>) : <div className="p-8 text-center"><CircleHelp className="mx-auto mb-3 size-5 text-muted" /><p className="text-sm text-muted">{databaseUnavailable ? "No events yet. Activity will appear here as the system runs." : "Loading system events..."}</p></div>}</div></div>
          <div className="rounded-xl border border-card-border bg-card"><div className="flex items-center justify-between border-b border-card-border p-5"><div><p className="flex items-center gap-2 text-xs text-muted"><BarChart3 className="size-4 text-accent" />Position monitor</p><h2 className="mt-2 text-lg font-semibold">Open positions</h2></div><Button variant="ghost" size="sm" onClick={() => window.location.href = "/portfolio"}>View portfolio<ArrowUpRight data-icon="inline-end" /></Button></div>{portfolio?.positions?.length ? <div className="flex flex-col">{portfolio.positions.map((position) => <div key={position.id} className="flex items-center justify-between gap-3 border-b border-card-border px-5 py-4 last:border-0"><div><p className="font-mono text-sm">{position.mint.slice(0, 6)}…{position.mint.slice(-4)}</p><p className="mt-1 text-xs text-muted">{position.status} · entry {formatSol(position.entryAmountSol)}</p></div><p className="font-mono text-sm">{formatSol(position.unrealizedPnlSol)}</p></div>)}</div> : <div className="p-8 text-center"><Gauge className="mx-auto mb-3 size-5 text-muted" /><p className="text-sm text-muted">No open positions. Approved entries will be monitored here.</p></div>}</div>
        </section>
      </div>
      <BottomNav />
    </main>
  );
}
