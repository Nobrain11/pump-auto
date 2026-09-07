/**
 * Token Scoring Engine
 * Scores are derived from real data only.
 * Never hard-code or randomly generate scores in production.
 */

import type { TokenScoreBreakdown, RiskLevel } from "@/types";

export interface TokenMetrics {
  mint: string;
  liquidityUsd: number | null;
  volume24hUsd: number | null;
  holderCount: number | null;
  ageMinutes: number | null;
  buySellRatio: number | null;
  topHolderPct: number | null;
  creatorLaunchCount: number | null;
  creatorGraduatedCount: number | null;
  creatorConfidence: "LOW" | "MEDIUM" | "HIGH" | null;
  hasMintAuthority: boolean | null;
  hasFreezeAuthority: boolean | null;
  suspiciousClusterScore: number | null;
  priceChange5m: number | null;
  priceChange1h: number | null;
}

function clamp(n: number, min = 0, max = 100) {
  return Math.max(min, Math.min(max, Math.round(n)));
}

function scoreLiquidity(usd: number | null): number {
  if (usd == null || usd <= 0) return 0;
  if (usd < 5_000) return 20;
  if (usd < 15_000) return 45;
  if (usd < 40_000) return 65;
  if (usd < 100_000) return 80;
  if (usd < 300_000) return 90;
  return 95;
}

function scoreFlow(ratio: number | null, volume: number | null): number {
  if (ratio == null) return 40;
  let s = 50;
  if (ratio > 1.8) s += 25;
  else if (ratio > 1.2) s += 15;
  else if (ratio < 0.6) s -= 25;
  else if (ratio < 0.9) s -= 10;
  if (volume && volume > 50_000) s += 10;
  return clamp(s);
}

function scoreMomentum(c5m: number | null, c1h: number | null): number {
  let s = 50;
  if (c5m != null) {
    if (c5m > 0.15) s += 20;
    else if (c5m > 0.05) s += 10;
    else if (c5m < -0.1) s -= 20;
  }
  if (c1h != null) {
    if (c1h > 0.3) s += 15;
    else if (c1h < -0.2) s -= 15;
  }
  return clamp(s);
}

function scoreHolders(count: number | null, topPct: number | null): number {
  let s = 50;
  if (count != null) {
    if (count > 500) s += 20;
    else if (count > 150) s += 10;
    else if (count < 30) s -= 20;
  }
  if (topPct != null) {
    if (topPct > 40) s -= 30;
    else if (topPct > 25) s -= 15;
    else if (topPct < 10) s += 10;
  }
  return clamp(s);
}

function scoreDev(
  launches: number | null,
  graduated: number | null,
  confidence: string | null
): number {
  if (launches == null || launches < 3) return 35;
  const ratio = graduated != null && launches > 0 ? graduated / launches : 0;
  let s = 40 + ratio * 40;
  if (confidence === "HIGH") s += 10;
  else if (confidence === "LOW") s -= 10;
  if (launches >= 15) s += 5;
  return clamp(s);
}

function scoreSafety(
  mintAuth: boolean | null,
  freezeAuth: boolean | null,
  cluster: number | null
): number {
  let s = 90;
  if (mintAuth === true) s -= 40;
  if (freezeAuth === true) s -= 25;
  if (cluster != null) s -= Math.min(40, cluster * 0.4);
  return clamp(s);
}

function scoreMarketFit(ageMin: number | null, liq: number | null): number {
  let s = 60;
  if (ageMin != null) {
    if (ageMin < 3) s -= 15;
    else if (ageMin > 60 && ageMin < 1440) s += 10;
  }
  if (liq != null && liq > 25_000) s += 10;
  return clamp(s);
}

function deriveRisk(
  overall: number,
  safety: number,
  topHolderPct: number | null,
  mintAuth: boolean | null
): RiskLevel {
  if (mintAuth === true || safety < 40) return "CRITICAL";
  if (safety < 55 || (topHolderPct != null && topHolderPct > 45) || overall < 45)
    return "HIGH";
  if (overall < 65 || safety < 70) return "MEDIUM";
  return "LOW";
}

export function computeTokenScore(metrics: TokenMetrics): TokenScoreBreakdown {
  const dev = scoreDev(
    metrics.creatorLaunchCount,
    metrics.creatorGraduatedCount,
    metrics.creatorConfidence
  );
  const liquidity = scoreLiquidity(metrics.liquidityUsd);
  const flow = scoreFlow(metrics.buySellRatio, metrics.volume24hUsd);
  const momentum = scoreMomentum(metrics.priceChange5m, metrics.priceChange1h);
  const holderQuality = scoreHolders(metrics.holderCount, metrics.topHolderPct);
  const safety = scoreSafety(
    metrics.hasMintAuthority,
    metrics.hasFreezeAuthority,
    metrics.suspiciousClusterScore
  );
  const marketFit = scoreMarketFit(metrics.ageMinutes, metrics.liquidityUsd);

  const overall = clamp(
    dev * 0.18 +
      liquidity * 0.18 +
      flow * 0.16 +
      momentum * 0.12 +
      holderQuality * 0.12 +
      safety * 0.16 +
      marketFit * 0.08
  );

  const risk = deriveRisk(overall, safety, metrics.topHolderPct, metrics.hasMintAuthority);

  return {
    overall,
    dev,
    liquidity,
    flow,
    momentum,
    holderQuality,
    safety,
    marketFit,
    risk,
    components: {
      liquidityUsd: metrics.liquidityUsd,
      volume24hUsd: metrics.volume24hUsd,
      holderCount: metrics.holderCount,
      ageMinutes: metrics.ageMinutes,
      buySellRatio: metrics.buySellRatio,
      topHolderPct: metrics.topHolderPct,
      creatorLaunches: metrics.creatorLaunchCount,
      hasMintAuthority: metrics.hasMintAuthority,
      hasFreezeAuthority: metrics.hasFreezeAuthority,
    },
    computedAt: new Date().toISOString(),
  };
}
