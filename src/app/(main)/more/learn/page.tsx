"use client";

import Link from "next/link";
import { BottomNav } from "@/components/layout/bottom-nav";

const topics = [
  {
    title: "What is Pump.fun?",
    body: "Pump.fun is a Solana platform for launching tokens with a bonding curve. Early buyers provide liquidity along the curve until the token graduates to a full DEX pool. Graduation is not the same as profitability.",
  },
  {
    title: "Liquidity",
    body: "Liquidity is the amount of capital available to trade against. Low liquidity means high slippage and easier price manipulation. Auto-Hunter requires a minimum liquidity threshold before considering an entry.",
  },
  {
    title: "Slippage",
    body: "Slippage is the difference between expected and executed price. Every trade sets a max slippage (basis points). If the route would exceed it, the trade fails instead of filling poorly.",
  },
  {
    title: "Developer Score",
    body: "Developer scores use verified on-chain history. Confidence is shown separately. A high score on only 2 launches is not allowed — sample size caps the score.",
  },
  {
    title: "Token Score",
    body: "Composite of developer quality, liquidity, flow, momentum, holders, safety, and market fit. Scores are computed from live data, never random or hard-coded.",
  },
  {
    title: "Risk Engine",
    body: "Every automated trade must pass: daily loss cap, max per-trade size, max wallet exposure, max concurrent positions, cooldown, and emergency stop.",
  },
  {
    title: "How Auto-Hunter works",
    body: "Detect → validate → liquidity → creator → holders → flow → safety → score → risk → execute → monitor. New does not mean buy.",
  },
  {
    title: "Submitted vs Confirmed",
    body: "Positions and PnL update only after confirmation. The order state machine tracks through SUBMITTED → CONFIRMING → CONFIRMED (or FAILED).",
  },
];

export default function LearnPage() {
  return (
    <main className="min-h-dvh flex flex-col pb-20">
      <header className="px-5 pt-6 pb-4 border-b border-[var(--card-border)]">
        <Link href="/more" className="text-xs text-[var(--muted)]">
          ← More
        </Link>
        <h1 className="text-lg font-bold text-white mt-1">Learn</h1>
      </header>

      <div className="flex-1 px-5 py-4 max-w-lg mx-auto w-full space-y-3">
        {topics.map((t) => (
          <details
            key={t.title}
            className="rounded-xl border border-[var(--card-border)] bg-[var(--card)] group"
          >
            <summary className="px-4 py-3.5 text-sm font-medium text-white cursor-pointer list-none flex justify-between items-center">
              {t.title}
              <span className="text-[var(--muted)] group-open:rotate-90 transition-transform">›</span>
            </summary>
            <div className="px-4 pb-4 text-xs text-[var(--muted)] leading-relaxed">{t.body}</div>
          </details>
        ))}
      </div>

      <BottomNav />
    </main>
  );
}
