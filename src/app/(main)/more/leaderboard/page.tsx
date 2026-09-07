"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { ArrowUpRight, ChevronRight, CircleHelp, Copy, Filter, ShieldCheck, TrendingUp, Users } from "lucide-react";
import { BottomNav } from "@/components/layout/bottom-nav";
import { Button } from "@/components/ui/button";

type Tab = "traders" | "coins" | "activity";
type Period = "1D" | "7D" | "30D" | "ALL";
type Metric = "ROI" | "PNL" | "WIN RATE" | "VOLUME" | "RISK";

interface LeaderboardResponse {
  traders?: Array<{ id: string; name: string; verified: boolean; roiPct: number; pnlSol: number; winRatePct: number; trades: number; volumeSol: number; followers: number; risk: string }>;
  note?: string;
}

const periods: Period[] = ["1D", "7D", "30D", "ALL"];
const metrics: Metric[] = ["ROI", "PNL", "WIN RATE", "VOLUME", "RISK"];

export default function LeaderboardPage() {
  const [tab, setTab] = useState<Tab>("traders");
  const [period, setPeriod] = useState<Period>("7D");
  const [metric, setMetric] = useState<Metric>("ROI");
  const [data, setData] = useState<LeaderboardResponse | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;
    fetch(`/api/leaderboard?period=${period.toLowerCase()}&metric=${encodeURIComponent(metric)}`, { cache: "no-store" })
      .then(async (res) => {
        const next = await res.json();
        if (active) setData(next);
      })
      .catch(() => { if (active) setData({ note: "Leaderboard data is unavailable." }); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [period, metric]);

  const title = useMemo(() => ({ traders: "Top traders", coins: "Top coins", activity: "Copy activity" }[tab]), [tab]);
  const unavailable = !loading && (!data?.traders?.length);

  return (
    <main className="min-h-dvh bg-background pb-24 text-foreground lg:pb-8">
      <header className="border-b border-card-border bg-card/70">
        <div className="mx-auto max-w-6xl px-4 py-6 sm:px-6 lg:px-8">
          <Link href="/more" className="font-mono text-[10px] uppercase tracking-[0.24em] text-muted">More / Discovery</Link>
          <div className="mt-5 flex flex-wrap items-end justify-between gap-4">
            <div><p className="flex items-center gap-2 text-xs text-primary"><TrendingUp className="size-4" />Verified performance</p><h1 className="mt-2 text-3xl font-semibold tracking-tight text-balance">Leaderboard</h1><p className="mt-2 max-w-md text-sm leading-6 text-muted">Discover traders. See what they&apos;re trading. Copy selectively.</p></div>
            <div className="flex items-center gap-2 rounded-full border border-card-border px-3 py-2 font-mono text-[10px] text-muted"><ShieldCheck className="size-3 text-primary" />ON-CHAIN DATA ONLY</div>
          </div>
        </div>
      </header>

      <div className="mx-auto flex max-w-6xl flex-col gap-5 px-4 py-5 sm:px-6 lg:px-8">
        <div className="flex flex-wrap gap-2 rounded-xl border border-card-border bg-card p-2">
          {([ ["traders", "Top traders"], ["coins", "Top coins"], ["activity", "Copy activity"] ] as const).map(([value, label]) => <button key={value} type="button" onClick={() => setTab(value)} className={`rounded-lg px-4 py-2.5 text-sm transition-colors ${tab === value ? "bg-primary text-primary-foreground" : "text-muted hover:bg-background"}`}>{label}</button>)}
        </div>

        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap items-center gap-1 rounded-lg border border-card-border p-1">{periods.map((value) => <button key={value} type="button" onClick={() => { setPeriod(value); setLoading(true); }} className={`rounded-md px-3 py-1.5 font-mono text-[10px] ${period === value ? "bg-muted/15 text-foreground" : "text-muted"}`}>{value}</button>)}</div>
          <div className="flex items-center gap-2 text-xs text-muted"><Filter className="size-3" />Sort by {metrics.map((value) => <button key={value} type="button" onClick={() => { setMetric(value); setLoading(true); }} className={`rounded-full border px-2.5 py-1 font-mono text-[10px] ${metric === value ? "border-primary/40 text-primary" : "border-card-border"}`}>{value}</button>)}</div>
        </div>

        <section className="rounded-xl border border-card-border bg-card">
          <div className="flex items-center justify-between border-b border-card-border px-5 py-4"><div><p className="font-mono text-[10px] uppercase tracking-[0.2em] text-muted">{period} / {metric}</p><h2 className="mt-1 text-lg font-semibold">{title}</h2></div><p className="text-xs text-muted">Verified results only</p></div>
          {loading ? <div className="flex flex-col gap-3 p-5">{[1, 2, 3].map((item) => <div key={item} className="h-32 animate-pulse rounded-lg bg-background" />)}</div> : unavailable ? <div className="flex flex-col items-center gap-3 px-6 py-16 text-center"><CircleHelp className="size-6 text-muted" /><h3 className="font-medium">No verified results yet</h3><p className="max-w-sm text-sm leading-6 text-muted">{data?.note ?? "Verified trader performance will appear here once the activity index is connected."}</p><Link href="/terminal" className="inline-flex h-9 items-center justify-center gap-2 rounded-md border border-card-border bg-card px-4 text-sm font-medium"><span>Open terminal</span><ArrowUpRight className="size-4" /></Link></div> : <div className="grid gap-3 p-4 md:grid-cols-2 xl:grid-cols-3">{data?.traders?.map((trader, index) => <article key={trader.id} className="rounded-lg border border-card-border bg-background p-4"><div className="flex items-start justify-between gap-3"><div className="flex items-center gap-3"><span className="font-mono text-xs text-muted">#{String(index + 1).padStart(2, "0")}</span><div><h3 className="font-semibold">{trader.name}</h3><p className="mt-1 flex items-center gap-1 text-[10px] text-primary"><ShieldCheck className="size-3" />Verified trader</p></div></div><span className="rounded-full bg-primary/10 px-2 py-1 font-mono text-[10px] text-primary">{trader.risk}</span></div><div className="mt-5 grid grid-cols-2 gap-3"><div><p className="text-[10px] text-muted">ROI</p><p className="mt-1 font-mono text-lg">{trader.roiPct}%</p></div><div><p className="text-[10px] text-muted">Realized PnL</p><p className="mt-1 font-mono text-lg">{trader.pnlSol} SOL</p></div></div><div className="mt-4 grid grid-cols-3 gap-2 border-t border-card-border pt-3 text-xs"><span><b className="block font-mono text-foreground">{trader.winRatePct}%</b><small className="text-muted">Win rate</small></span><span><b className="block font-mono text-foreground">{trader.trades}</b><small className="text-muted">Trades</small></span><span><b className="block font-mono text-foreground">{trader.followers}</b><small className="text-muted">Followers</small></span></div><div className="mt-4 flex gap-2"><Link href={`/more/leaderboard/${trader.id}`} className="inline-flex h-8 flex-1 items-center justify-center gap-2 rounded-md border border-card-border bg-card px-3 text-xs font-medium"><span>View trader</span><ChevronRight className="size-4" /></Link><Link href={`/more/copy-trade?trader=${trader.id}`} className="inline-flex h-8 items-center justify-center gap-2 rounded-md bg-primary px-3 text-xs font-medium text-primary-foreground"><Copy className="size-4" />Copy</Link></div></article>)}</div>}
        </section>
        <p className="flex items-center gap-2 text-xs leading-5 text-muted"><Users className="size-3 shrink-0" />Performance is separated into verified realized results, unrealized exposure, confidence, and sample size before copying.</p>
      </div><BottomNav />
    </main>
  );
}
