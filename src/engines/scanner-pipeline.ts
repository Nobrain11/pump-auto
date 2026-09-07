/**
 * Auto-Hunter Scanner Pipeline
 *
 * TOKEN DETECTED → VALIDATION → LIQUIDITY → CREATOR → HOLDERS → FLOW → SAFETY → SCORE → RISK → DECISION
 * Never enter merely because a token is new.
 */

import { computeTokenScore } from "@/engines/token-scoring";
import type { TokenMetrics } from "@/engines/token-scoring";
import type { TokenScoreBreakdown, RiskLevel } from "@/types";
import type { DiscoveredToken } from "@/lib/solana/token-discovery";
import type { TokenMarketSnapshot } from "@/providers/market-data-provider";

export interface ScannerFilters {
  minLiquidityUsd: number;
  maxLiquidityUsd?: number;
  minVolumeUsd?: number;
  minScore: number;
  maxRisk: RiskLevel;
  maxAgeMinutes?: number;
  requireNoMintAuthority?: boolean;
  requireNoFreezeAuthority?: boolean;
}

export const DEFAULT_FILTERS: ScannerFilters = {
  minLiquidityUsd: 10_000,
  minScore: 70,
  maxRisk: "MEDIUM",
  maxAgeMinutes: 1440,
  requireNoMintAuthority: true,
  requireNoFreezeAuthority: true,
};

export interface ScannedOpportunity {
  mint: string;
  symbol?: string;
  name?: string;
  score: TokenScoreBreakdown;
  market: TokenMarketSnapshot | null;
  passedFilters: boolean;
  rejectReasons: string[];
  discoveredAt: string;
  analyzedAt: string;
}

const RISK_ORDER: RiskLevel[] = ["LOW", "MEDIUM", "HIGH", "CRITICAL"];

function riskWorseThan(a: RiskLevel, max: RiskLevel): boolean {
  return RISK_ORDER.indexOf(a) > RISK_ORDER.indexOf(max);
}

export function analyzeToken(
  discovered: DiscoveredToken,
  filters: ScannerFilters = DEFAULT_FILTERS,
  extraMetrics?: Partial<TokenMetrics>
): ScannedOpportunity {
  const market = discovered.market;
  const rejectReasons: string[] = [];

  const metrics: TokenMetrics = {
    mint: discovered.mint,
    liquidityUsd: market?.liquidityUsd ?? extraMetrics?.liquidityUsd ?? null,
    volume24hUsd: market?.volume24hUsd ?? extraMetrics?.volume24hUsd ?? null,
    holderCount: extraMetrics?.holderCount ?? null,
    ageMinutes: extraMetrics?.ageMinutes ?? null,
    buySellRatio: extraMetrics?.buySellRatio ?? null,
    topHolderPct: extraMetrics?.topHolderPct ?? null,
    creatorLaunchCount: extraMetrics?.creatorLaunchCount ?? null,
    creatorGraduatedCount: extraMetrics?.creatorGraduatedCount ?? null,
    creatorConfidence: extraMetrics?.creatorConfidence ?? null,
    hasMintAuthority: extraMetrics?.hasMintAuthority ?? null,
    hasFreezeAuthority: extraMetrics?.hasFreezeAuthority ?? null,
    suspiciousClusterScore: extraMetrics?.suspiciousClusterScore ?? null,
    priceChange5m: market?.priceChange5m ?? extraMetrics?.priceChange5m ?? null,
    priceChange1h: market?.priceChange1h ?? extraMetrics?.priceChange1h ?? null,
  };

  if (metrics.liquidityUsd == null || metrics.liquidityUsd < filters.minLiquidityUsd) {
    rejectReasons.push(`Liquidity ${metrics.liquidityUsd ?? 0} < min ${filters.minLiquidityUsd}`);
  }
  if (filters.maxLiquidityUsd != null && metrics.liquidityUsd != null && metrics.liquidityUsd > filters.maxLiquidityUsd) {
    rejectReasons.push(`Liquidity above max ${filters.maxLiquidityUsd}`);
  }
  if (filters.minVolumeUsd != null && (metrics.volume24hUsd == null || metrics.volume24hUsd < filters.minVolumeUsd)) {
    rejectReasons.push("Volume below minimum");
  }
  if (filters.requireNoMintAuthority && metrics.hasMintAuthority === true) {
    rejectReasons.push("Mint authority still enabled");
  }
  if (filters.requireNoFreezeAuthority && metrics.hasFreezeAuthority === true) {
    rejectReasons.push("Freeze authority still enabled");
  }

  const score = computeTokenScore(metrics);

  if (score.overall < filters.minScore) {
    rejectReasons.push(`Score ${score.overall} < min ${filters.minScore}`);
  }
  if (riskWorseThan(score.risk, filters.maxRisk)) {
    rejectReasons.push(`Risk ${score.risk} exceeds max ${filters.maxRisk}`);
  }

  return {
    mint: discovered.mint,
    symbol: discovered.symbol || market?.symbol,
    name: discovered.name || market?.name,
    score,
    market: market || null,
    passedFilters: rejectReasons.length === 0,
    rejectReasons,
    discoveredAt: discovered.discoveredAt,
    analyzedAt: new Date().toISOString(),
  };
}

export function analyzeBatch(
  tokens: DiscoveredToken[],
  filters?: ScannerFilters
): ScannedOpportunity[] {
  return tokens.map((t) => analyzeToken(t, filters));
}
