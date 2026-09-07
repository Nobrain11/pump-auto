import { NextResponse } from "next/server";
import { createTokenDiscovery } from "@/lib/solana/token-discovery";
import { analyzeBatch, DEFAULT_FILTERS } from "@/engines/scanner-pipeline";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

export async function GET() {
  try {
    const discovery = createTokenDiscovery();
    const discovered = await discovery.getRecentTokens(20);
    const opportunities = analyzeBatch(discovered, DEFAULT_FILTERS);

    const passed = opportunities.filter((o) => o.passedFilters);
    const rejected = opportunities.filter((o) => !o.passedFilters);

    return NextResponse.json({
      scannedAt: new Date().toISOString(),
      filters: DEFAULT_FILTERS,
      total: opportunities.length,
      passed: passed.length,
      rejected: rejected.length,
      opportunities: opportunities
        .sort((a, b) => b.score.overall - a.score.overall)
        .map((o) => ({
          mint: o.mint,
          symbol: o.symbol,
          name: o.name,
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
          liquidityUsd: o.market?.liquidityUsd ?? null,
          volume24hUsd: o.market?.volume24hUsd ?? null,
          priceUsd: o.market?.priceUsd ?? null,
          passedFilters: o.passedFilters,
          rejectReasons: o.rejectReasons,
          analyzedAt: o.analyzedAt,
        })),
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Scanner failed";
    console.error("[scanner] API error:", message);
    return NextResponse.json(
      {
        error: "Scanner unavailable",
        detail: message,
        note: "Production fails visibly when market data providers are down. No mock data.",
      },
      { status: 503 }
    );
  }
}
