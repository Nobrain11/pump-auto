/**
 * Developer Intelligence Scoring
 *
 * Rules:
 * - Never claim high success rates without sufficient sample size.
 * - "Graduated" ≠ "profitable".
 * - Confidence is displayed separately from the numeric score.
 * - Minimum launches required before HIGH confidence.
 */

import type { Confidence, DeveloperStats } from "@/types";

export interface DeveloperRawStats {
  address: string;
  totalLaunches: number;
  graduatedCount: number;
  abandonedCount: number;
  activeCount: number;
  medianSurvivalSeconds: number | null;
  medianPeakMultiple: number | null;
  riskIndicators?: string[];
}

const MIN_LAUNCHES_FOR_MEDIUM = 5;
const MIN_LAUNCHES_FOR_HIGH = 12;

export function computeDeveloperConfidence(totalLaunches: number): Confidence {
  if (totalLaunches >= MIN_LAUNCHES_FOR_HIGH) return "HIGH";
  if (totalLaunches >= MIN_LAUNCHES_FOR_MEDIUM) return "MEDIUM";
  return "LOW";
}

export function computeDeveloperScore(raw: DeveloperRawStats): DeveloperStats {
  const {
    address,
    totalLaunches,
    graduatedCount,
    abandonedCount,
    activeCount,
    medianSurvivalSeconds,
    medianPeakMultiple,
    riskIndicators = [],
  } = raw;

  const confidence = computeDeveloperConfidence(totalLaunches);
  const sampleSize = totalLaunches;

  let successfulLaunchRatio: number | null = null;
  if (totalLaunches >= MIN_LAUNCHES_FOR_MEDIUM) {
    successfulLaunchRatio = graduatedCount / totalLaunches;
  }

  let score = 40;

  if (totalLaunches >= 3) {
    const gradRatio = graduatedCount / Math.max(1, totalLaunches);
    score += gradRatio * 35;

    const abandonRatio = abandonedCount / Math.max(1, totalLaunches);
    score -= abandonRatio * 20;

    if (medianPeakMultiple != null) {
      if (medianPeakMultiple >= 3) score += 10;
      else if (medianPeakMultiple >= 1.5) score += 5;
      else if (medianPeakMultiple < 0.8) score -= 10;
    }

    if (medianSurvivalSeconds != null) {
      if (medianSurvivalSeconds > 86_400) score += 8;
      else if (medianSurvivalSeconds < 3_600) score -= 8;
    }
  }

  score -= Math.min(25, riskIndicators.length * 8);

  if (confidence === "LOW") {
    score = Math.min(score, 55);
  } else if (confidence === "MEDIUM") {
    score = Math.min(score, 78);
  }

  score = Math.max(0, Math.min(100, Math.round(score)));

  return {
    address,
    totalLaunches,
    graduatedCount,
    abandonedCount,
    activeCount,
    medianSurvivalSeconds,
    medianPeakMultiple,
    successfulLaunchRatio,
    sampleSize,
    confidence,
    riskIndicators,
    score,
  };
}
