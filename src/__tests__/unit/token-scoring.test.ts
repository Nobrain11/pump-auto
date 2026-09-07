/**
 * Unit tests for token scoring — pure functions, no network.
 */

import { describe, it, expect } from "vitest";
import { computeTokenScore } from "@/engines/token-scoring";
import type { TokenMetrics } from "@/engines/token-scoring";

const base: TokenMetrics = {
  mint: "TestMint111111111111111111111111111111111",
  liquidityUsd: 50_000,
  volume24hUsd: 80_000,
  holderCount: 200,
  ageMinutes: 120,
  buySellRatio: 1.4,
  topHolderPct: 12,
  creatorLaunchCount: 20,
  creatorGraduatedCount: 12,
  creatorConfidence: "HIGH",
  hasMintAuthority: false,
  hasFreezeAuthority: false,
  suspiciousClusterScore: 5,
  priceChange5m: 0.08,
  priceChange1h: 0.2,
};

describe("computeTokenScore", () => {
  it("returns overall between 0 and 100", () => {
    const s = computeTokenScore(base);
    expect(s.overall).toBeGreaterThanOrEqual(0);
    expect(s.overall).toBeLessThanOrEqual(100);
  });

  it("penalizes mint authority", () => {
    const safe = computeTokenScore(base);
    const unsafe = computeTokenScore({ ...base, hasMintAuthority: true });
    expect(unsafe.safety).toBeLessThan(safe.safety);
    expect(unsafe.risk === "HIGH" || unsafe.risk === "CRITICAL").toBe(true);
  });

  it("gives low score on tiny liquidity", () => {
    const s = computeTokenScore({ ...base, liquidityUsd: 500 });
    expect(s.liquidity).toBeLessThan(40);
  });

  it("includes components for transparency", () => {
    const s = computeTokenScore(base);
    expect(s.components).toBeDefined();
    expect(s.computedAt).toBeTruthy();
  });

  it("does not invent high scores with null metrics", () => {
    const sparse: TokenMetrics = {
      mint: "x",
      liquidityUsd: null,
      volume24hUsd: null,
      holderCount: null,
      ageMinutes: null,
      buySellRatio: null,
      topHolderPct: null,
      creatorLaunchCount: null,
      creatorGraduatedCount: null,
      creatorConfidence: null,
      hasMintAuthority: null,
      hasFreezeAuthority: null,
      suspiciousClusterScore: null,
      priceChange5m: null,
      priceChange1h: null,
    };
    const s = computeTokenScore(sparse);
    expect(s.overall).toBeLessThan(70);
  });
});
