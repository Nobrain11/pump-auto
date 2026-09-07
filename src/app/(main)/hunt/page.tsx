"use client";

import { useEffect, useState, useCallback } from "react";
import { BottomNav } from "@/components/layout/bottom-nav";
import { Button } from "@/components/ui/button";

interface Opportunity {
  mint: string;
  symbol?: string;
  name?: string;
  score: number;
  risk: string;
  breakdown: Record<string, number>;
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
      if (!res.ok) {
        throw new Error(data.detail || data.error || "Scanner failed");
      }
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

  const riskColor = (r: string) => {
    if (r === "LOW") return "text-[var(--success)]";
    if (r === "MEDIUM") return "text-[var(--warning)]";
    return "text-[var(--danger)]";
  };

  return (
    <main className="min-h-dvh flex flex-col pb-20">
      <header className="px-5 pt-6 pb-4 border-b border-[var(--card-border)] flex justify-between items-end">
        <div>
          <p className="text-[10px] font-mono tracking-widest text-[var(--muted)] uppercase">
            Scanner
          </p>
          <h1 className="text-lg font-bold text-white">Hunt</h1>
        </div>
        <Button size="sm" variant="secondary" onClick={scan} disabled={loading}>
          {loading ? "Scanning…" : "Refresh"}
        </Button>
      </header>

      <div className="flex-1 px-5 py-4 max-w-lg mx-auto w-full space-y-4">
        <div className="grid grid-cols-3 gap-2">
          {["total", "passed", "rejected"].map((k) => (
            <div
              key={k}
              className="rounded-xl border border-[var(--card-border)] bg-[var(--card)] p-3 text-center"
            >
              <p className="text-lg font-mono font-semibold text-white">
                {stats[k as keyof typeof stats]}
              </p>
              <p className="text-[10px] text-[var(--muted)] uppercase">{k}</p>
            </div>
          ))}
        </div>

        {scannedAt && (
          <p className="text-[10px] font-mono text-[var(--muted)]">
            Last scan: {new Date(scannedAt).toLocaleTimeString()}
          </p>
        )}

        {error && (
          <div className="rounded-xl border border-[var(--danger)]/40 bg-[var(--danger)]/10 px-4 py-3 text-sm text-[var(--danger)]">
            {error}
            <p className="text-[10px] mt-1 opacity-80">
              No mock data shown. Fix market data / RPC connectivity.
            </p>
          </div>
        )}

        <div className="space-y-2">
          {opps.map((o) => (
            <div
              key={o.mint}
              className={`rounded-xl border bg-[var(--card)] p-4 ${
                o.passedFilters
                  ? "border-[var(--primary)]/30"
                  : "border-[var(--card-border)] opacity-70"
              }`}
            >
              <div className="flex justify-between items-start gap-2">
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-white truncate">
                    {o.symbol || o.mint.slice(0, 8)}
                    {o.name && (
                      <span className="text-[var(--muted)] font-normal"> · {o.name}</span>
                    )}
                  </p>
                  <p className="text-[10px] font-mono text-[var(--muted)] truncate">
                    {o.mint}
                  </p>
                </div>
                <div className="text-right shrink-0">
                  <p className="text-lg font-mono font-bold text-white">{o.score}</p>
                  <p className={`text-[10px] font-mono ${riskColor(o.risk)}`}>{o.risk}</p>
                </div>
              </div>
              <div className="mt-2 flex flex-wrap gap-2 text-[10px] text-[var(--muted)] font-mono">
                {o.liquidityUsd != null && <span>Liq ${Math.round(o.liquidityUsd).toLocaleString()}</span>}
                {o.volume24hUsd != null && <span>Vol ${Math.round(o.volume24hUsd).toLocaleString()}</span>}
              </div>
              {!o.passedFilters && o.rejectReasons.length > 0 && (
                <p className="mt-2 text-[10px] text-[var(--warning)]">
                  {o.rejectReasons.join(" · ")}
                </p>
              )}
            </div>
          ))}
        </div>
      </div>

      <BottomNav />
    </main>
  );
}
