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
  imageUrl?: string | null;
  score: number;
  risk: string;
  breakdown?: Record<string, number>;
  marketCapUsd?: number | null;
  liquidityUsd: number | null;
  volume24hUsd: number | null;
  priceUsd: number | null;
  source?: string;
  passedFilters: boolean;
  rejectReasons: string[];
  analyzedAt: string;
}

export default function HuntPage() {
  const [opps, setOpps] = useState<Opportunity[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [scannedAt, setScannedAt] = useState<string | null>(null);
  const [source, setSource] = useState<string>("pump.fun");
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
      setSource(data.source || "pump.fun");
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
        <div className="flex-1 min-w-0">
          <p className="label">Pump.fun movers</p>
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

        <p className="text-[10px] mono text-[var(--muted)]">
          Source {source}
          {scannedAt ? ` · ${new Date(scannedAt).toLocaleTimeString()}` : ""}
        </p>

        {error && (
          <div className="panel border-[var(--danger)]/40 px-3 py-2 text-xs text-[var(--danger)]">
            {error}
          </div>
        )}

        <div className="space-y-2">
          {opps.map((o) => (
            <TokenCard
              key={o.mint}
              mint={o.mint}
              symbol={o.symbol}
              name={o.name}
              logoUrl={o.imageUrl}
              marketCapUsd={o.marketCapUsd}
              liquidityUsd={o.liquidityUsd}
              volume24hUsd={o.volume24hUsd}
              score={o.score}
              risk={o.risk}
              devScore={o.breakdown?.dev}
              flowScore={o.breakdown?.flow}
              momentumScore={o.breakdown?.momentum}
              passedFilters={o.passedFilters}
              rejectReasons={o.rejectReasons}
              ageLabel={o.source === "pump" ? "pump.fun" : o.source}
            />
          ))}
          {!loading && opps.length === 0 && !error && (
            <div className="panel p-6 text-center text-xs text-[var(--muted)]">
              No Pump.fun movers passed filters yet. Tap Refresh.
            </div>
          )}
        </div>
      </div>

      <BottomNav />
    </main>
  );
}
