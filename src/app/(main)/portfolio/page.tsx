"use client";

import { useEffect, useState, useCallback } from "react";
import { BottomNav } from "@/components/layout/bottom-nav";
import { Button } from "@/components/ui/button";

interface PositionRow {
  id: string;
  mint: string;
  entryAmountSol: number;
  currentAmountToken: number;
  realizedPnlSol: number;
  unrealizedPnlSol: number;
  highestPnlPct: number;
  maxDrawdownPct: number;
  status: string;
  openedAt: string;
}

interface PortfolioData {
  totalSol: number;
  realizedPnlSol: number;
  unrealizedPnlSol: number;
  exposureSol: number;
  positionCount: number;
  positions: PositionRow[];
  note?: string;
  asOf?: string;
}

export default function PortfolioPage() {
  const [data, setData] = useState<PortfolioData | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/portfolio");
      const json = await res.json();
      if (!res.ok && !json.note) throw new Error(json.error || "Failed");
      setData(json);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const totalPnl =
    (data?.realizedPnlSol || 0) + (data?.unrealizedPnlSol || 0);

  return (
    <main className="min-h-dvh flex flex-col pb-20">
      <header className="px-5 pt-6 pb-4 border-b border-[var(--card-border)] flex justify-between items-end">
        <div>
          <p className="text-[10px] font-mono tracking-widest text-[var(--muted)] uppercase">
            Portfolio
          </p>
          <h1 className="text-lg font-bold text-white">Positions & PnL</h1>
        </div>
        <Button size="sm" variant="secondary" onClick={load} disabled={loading}>
          {loading ? "…" : "Refresh"}
        </Button>
      </header>

      <div className="flex-1 px-5 py-5 max-w-lg mx-auto w-full space-y-5">
        {error && (
          <div className="rounded-xl border border-[var(--danger)]/40 bg-[var(--danger)]/10 px-4 py-3 text-sm text-[var(--danger)]">
            {error}
          </div>
        )}

        {data?.note && (
          <p className="text-[10px] text-[var(--muted)]">{data.note}</p>
        )}

        <div className="grid grid-cols-2 gap-3">
          <div className="rounded-xl border border-[var(--card-border)] bg-[var(--card)] p-4">
            <p className="text-[10px] text-[var(--muted)] uppercase">Balance</p>
            <p className="text-xl font-mono font-bold text-white">
              {(data?.totalSol ?? 0).toFixed(4)} SOL
            </p>
          </div>
          <div className="rounded-xl border border-[var(--card-border)] bg-[var(--card)] p-4">
            <p className="text-[10px] text-[var(--muted)] uppercase">Total PnL</p>
            <p
              className={`text-xl font-mono font-bold ${
                totalPnl >= 0 ? "text-[var(--success)]" : "text-[var(--danger)]"
              }`}
            >
              {totalPnl >= 0 ? "+" : ""}
              {totalPnl.toFixed(4)} SOL
            </p>
          </div>
          <div className="rounded-xl border border-[var(--card-border)] bg-[var(--card)] p-4">
            <p className="text-[10px] text-[var(--muted)] uppercase">Realized</p>
            <p className="text-sm font-mono text-white">
              {(data?.realizedPnlSol ?? 0).toFixed(4)}
            </p>
          </div>
          <div className="rounded-xl border border-[var(--card-border)] bg-[var(--card)] p-4">
            <p className="text-[10px] text-[var(--muted)] uppercase">Unrealized</p>
            <p className="text-sm font-mono text-white">
              {(data?.unrealizedPnlSol ?? 0).toFixed(4)}
            </p>
          </div>
        </div>

        <section className="space-y-2">
          <h2 className="text-xs font-mono tracking-widest text-[var(--muted)] uppercase">
            Open Positions ({data?.positionCount ?? 0})
          </h2>
          {(data?.positions || []).length === 0 && (
            <div className="rounded-xl border border-[var(--card-border)] bg-[var(--card)] p-6 text-center text-sm text-[var(--muted)]">
              No open positions. Positions open only after confirmed buys.
            </div>
          )}
          {(data?.positions || []).map((p) => (
            <div
              key={p.id}
              className="rounded-xl border border-[var(--card-border)] bg-[var(--card)] p-4"
            >
              <div className="flex justify-between">
                <p className="text-sm font-mono text-white">{p.mint.slice(0, 12)}…</p>
                <p
                  className={`text-sm font-mono ${
                    p.unrealizedPnlSol >= 0
                      ? "text-[var(--success)]"
                      : "text-[var(--danger)]"
                  }`}
                >
                  {p.unrealizedPnlSol >= 0 ? "+" : ""}
                  {p.unrealizedPnlSol.toFixed(4)} SOL
                </p>
              </div>
              <p className="text-[10px] text-[var(--muted)] mt-1">
                Entry {p.entryAmountSol.toFixed(4)} SOL · {p.status}
              </p>
            </div>
          ))}
        </section>
      </div>

      <BottomNav />
    </main>
  );
}
