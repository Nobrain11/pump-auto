import { NextResponse } from "next/server";
import { createTokenDiscovery } from "@/lib/solana/token-discovery";
import { analyzeBatch, DEFAULT_FILTERS } from "@/engines/scanner-pipeline";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

export async function GET() {
  try {
    const discovery = createTokenDiscovery();
    const discovered = await discovery.getRecentTokens(30);
    const opportunities = analyzeBatch(discovered, DEFAULT_FILTERS);
    const passed = opportunities.filter((o) => o.passedFilters);
    const rejected = opportunities.filter((o) => !o.passedFilters);
    const meta = new Map(discovered.map((d) => [d.mint, d]));

    return NextResponse.json({
      scannedAt: new Date().toISOString(),
      source: "pump.fun",
      filters: DEFAULT_FILTERS,
      total: opportunities.length,
      passed: passed.length,
      rejected: rejected.length,
      opportunities: opportunities
        .sort((a, b) => b.score.overall - a.score.overall)
        .map((o) => {
          const d = meta.get(o.mint);
          return {
            mint: o.mint,
            symbol: o.symbol || d?.symbol,
            name: o.name || d?.name,
            imageUrl: d?.imageUrl || null,
            score: o.score.overall,
            risk: o.score.risk,
            breakdown: {
              dev: o.score.dev,
              liquidity: o.score.liquidity,
              flow: o.score.flow,
              momentum: o.score.momentum,
              holderQuality: o.score.holderQuality,
              safety: o.score.safety,
              marketFit: o.score.marketFit,
            },
            marketCapUsd: o.market?.marketCapUsd ?? d?.marketCapUsd ?? null,
            liquidityUsd: o.market?.liquidityUsd ?? d?.liquidityUsd ?? null,
            volume24hUsd: o.market?.volume24hUsd ?? d?.volume24hUsd ?? null,
            priceUsd: o.market?.priceUsd ?? d?.priceUsd ?? null,
            source: d?.source || "pump",
            passedFilters: o.passedFilters,
            rejectReasons: o.rejectReasons,
            analyzedAt: o.analyzedAt,
          };
        }),
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Scanner failed";
    console.error("[scanner] API error:", message);
    return NextResponse.json(
      {
        error: "Scanner unavailable",
        detail: message,
        note: "No mock data.",
      },
      { status: 503 }
    );
  }
}
