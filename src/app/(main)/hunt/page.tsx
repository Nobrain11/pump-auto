"use client";

import { useEffect, useState, useCallback } from "react";
import { BottomNav } from "@/components/layout/bottom-nav";
import { Brand } from "@/components/layout/brand";
import { Button } from "@/components/ui/button";
import { TokenCard } from "@/components/trading/token-card";

interface Opportunity {
  mint: string;
  symbol?: string;
  name?: string;
  score: number;
  risk: string;
  breakdown?: Record<string, number>;
  liquidityUsd: number | null;
  volume24hUsd: number | null;
  priceUsd: number | null;
  passedFilters: boolean;
  rejectReasons: string[];
  analyzedAt: string;
}

export default function HuntPage() {
  const [opps, setOpps] = useState<Opportunity[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [scannedAt, setScannedAt] = useState<string | null>(null);
  const [stats, setStats] = useState({ total: 0, passed: 0, rejected: 0 });

  const scan = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/scanner");
      const data = await res.json();
      if (!res.ok) throw new Error(data.detail || data.error || "Scanner failed");
      setOpps(data.opportunities || []);
      setScannedAt(data.scannedAt);
      setStats({
        total: data.total || 0,
        passed: data.passed || 0,
        rejected: data.rejected || 0,
      });
    } catch (e) {
      setError(e instanceof Error ? e.message : "Scan failed");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    scan();
  }, [scan]);

  return (
    <main className="min-h-dvh flex flex-col pb-16">
      <header className="px-4 pt-4 pb-3 border-b border-[var(--card-border)] flex items-center justify-between gap-3">
        <Brand compact />
        <div className="flex-1">
          <p className="label">Scanner</p>
          <h1 className="text-sm font-semibold text-white">Hunt</h1>
        </div>
        <Button size="xs" variant="secondary" onClick={scan} disabled={loading}>
          {loading ? "…" : "Refresh"}
        </Button>
      </header>

      <div className="flex-1 px-4 py-3 max-w-lg mx-auto w-full space-y-3">
        <div className="grid grid-cols-3 gap-2">
          {[
            ["Detected", stats.total],
            ["Passed", stats.passed],
            ["Filtered", stats.rejected],
          ].map(([k, v]) => (
            <div key={String(k)} className="panel px-2.5 py-2 text-center">
              <p className="text-sm mono font-semibold text-white">{v}</p>
              <p className="label mt-0.5">{k}</p>
            </div>
          ))}
        </div>

        {scannedAt && (
          <p className="text-[10px] mono text-[var(--muted)]">
            Last scan {new Date(scannedAt).toLocaleTimeString()}
          </p>
        )}

        {error && (
          <div className="panel border-[var(--danger)]/40 px-3 py-2 text-xs text-[var(--danger)]">
            {error}
            <p className="text-[10px] mt-1 opacity-80">No mock data. Fix market data / RPC.</p>
          </div>
        )}

        <div className="space-y-2">
          {opps.map((o) => (
            <TokenCard
              key={o.mint}
              mint={o.mint}
              symbol={o.symbol}
              name={o.name}
              liquidityUsd={o.liquidityUsd}
              volume24hUsd={o.volume24hUsd}
              score={o.score}
              risk={o.risk}
              devScore={o.breakdown?.dev}
              flowScore={o.breakdown?.flow}
              momentumScore={o.breakdown?.momentum}
              passedFilters={o.passedFilters}
              rejectReasons={o.rejectReasons}
            />
          ))}
          {!loading && opps.length === 0 && !error && (
            <div className="panel p-6 text-center text-xs text-[var(--muted)]">
              No opportunities yet. Scanner uses live market data only.
            </div>
          )}
        </div>
      </div>

      <BottomNav />
    </main>
  );
}
