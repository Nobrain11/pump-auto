"use client";

import { cn } from "@/lib/utils/cn";
import { Button } from "@/components/ui/button";

export interface TokenCardProps {
  mint: string;
  symbol?: string | null;
  name?: string | null;
  logoUrl?: string | null;
  ageLabel?: string;
  marketCapUsd?: number | null;
  liquidityUsd?: number | null;
  volume24hUsd?: number | null;
  score?: number | null;
  risk?: string | null;
  devScore?: number | null;
  flowScore?: number | null;
  momentumScore?: number | null;
  passedFilters?: boolean;
  rejectReasons?: string[];
  onView?: () => void;
  onBuy?: () => void;
}

function fmtUsd(n?: number | null) {
  if (n == null || Number.isNaN(n)) return "—";
  if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(2)}M`;
  if (n >= 1_000) return `$${(n / 1_000).toFixed(1)}K`;
  return `$${n.toFixed(0)}`;
}

function fallbackLogo(symbol?: string | null, mint?: string) {
  return (symbol || mint || "?").slice(0, 1).toUpperCase();
}

export function TokenCard({
  mint,
  symbol,
  name,
  logoUrl,
  ageLabel,
  marketCapUsd,
  liquidityUsd,
  volume24hUsd,
  score,
  risk,
  devScore,
  flowScore,
  momentumScore,
  passedFilters = true,
  rejectReasons,
  onView,
  onBuy,
}: TokenCardProps) {
  const riskColor =
    risk === "LOW"
      ? "text-[var(--success)]"
      : risk === "MEDIUM"
        ? "text-[var(--warning)]"
        : "text-[var(--danger)]";

  return (
    <article className={cn("panel p-3 space-y-2.5", !passedFilters && "opacity-60")}>
      <div className="flex items-start gap-2.5">
        <div className="w-8 h-8 rounded-[var(--radius)] bg-[var(--card-elevated)] border border-[var(--card-border)] flex items-center justify-center overflow-hidden shrink-0">
          {logoUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={logoUrl} alt="" className="w-full h-full object-cover" />
          ) : (
            <span className="text-xs font-mono text-[var(--primary)]">
              {fallbackLogo(symbol, mint)}
            </span>
          )}
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-baseline gap-1.5">
            <span className="text-sm font-semibold text-white truncate">
              {name || symbol || mint.slice(0, 8)}
            </span>
            {symbol && (
              <span className="text-[11px] mono text-[var(--muted)]">${symbol}</span>
            )}
          </div>
          <p className="text-[10px] mono text-[var(--muted)] truncate">
            {ageLabel || mint.slice(0, 12) + "…"}
          </p>
        </div>
        {score != null && (
          <div className="text-right shrink-0">
            <p className="text-base font-mono font-semibold text-white leading-none">{score}</p>
            <p className={cn("text-[10px] mono mt-0.5", riskColor)}>{risk || "—"}</p>
          </div>
        )}
      </div>

      <div className="grid grid-cols-3 gap-2 text-[11px] mono">
        <div>
          <p className="label">MC</p>
          <p className="text-white">{fmtUsd(marketCapUsd)}</p>
        </div>
        <div>
          <p className="label">Liq</p>
          <p className="text-white">{fmtUsd(liquidityUsd)}</p>
        </div>
        <div>
          <p className="label">Vol</p>
          <p className="text-white">{fmtUsd(volume24hUsd)}</p>
        </div>
      </div>

      {(devScore != null || flowScore != null || momentumScore != null) && (
        <div className="flex gap-3 text-[10px] mono text-[var(--muted)]">
          {devScore != null && <span>DEV {devScore}</span>}
          {flowScore != null && <span>FLOW {flowScore}</span>}
          {momentumScore != null && <span>MOM {momentumScore}</span>}
        </div>
      )}

      {!passedFilters && rejectReasons && rejectReasons.length > 0 && (
        <p className="text-[10px] text-[var(--warning)]">{rejectReasons.join(" · ")}</p>
      )}

      <div className="flex gap-2 pt-0.5">
        <Button size="xs" variant="outline" className="flex-1" onClick={onView}>
          VIEW
        </Button>
        <Button size="xs" variant="primary" className="flex-1" onClick={onBuy} disabled={!passedFilters}>
          BUY
        </Button>
      </div>
    </article>
  );
}
