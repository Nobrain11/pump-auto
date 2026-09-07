import { describe, it, expect } from "vitest";
import {
  computeDeveloperScore,
  computeDeveloperConfidence,
} from "@/engines/developer-scoring";

describe("developer scoring", () => {
  it("assigns LOW confidence for few launches", () => {
    expect(computeDeveloperConfidence(2)).toBe("LOW");
    expect(computeDeveloperConfidence(5)).toBe("MEDIUM");
    expect(computeDeveloperConfidence(15)).toBe("HIGH");
  });

  it("caps score when sample size is low", () => {
    const low = computeDeveloperScore({
      address: "DevLow",
      totalLaunches: 2,
      graduatedCount: 2,
      abandonedCount: 0,
      activeCount: 0,
      medianSurvivalSeconds: 100000,
      medianPeakMultiple: 10,
    });
    expect(low.confidence).toBe("LOW");
    expect(low.score).toBeLessThanOrEqual(55);
    expect(low.successfulLaunchRatio).toBeNull();
  });

  it("allows higher score with sufficient sample", () => {
    const high = computeDeveloperScore({
      address: "DevHigh",
      totalLaunches: 30,
      graduatedCount: 22,
      abandonedCount: 3,
      activeCount: 5,
      medianSurvivalSeconds: 200000,
      medianPeakMultiple: 4,
    });
    expect(high.confidence).toBe("HIGH");
    expect(high.successfulLaunchRatio).not.toBeNull();
    expect(high.score).toBeGreaterThan(60);
  });

  it("never fabricates ratio without enough launches", () => {
    const s = computeDeveloperScore({
      address: "x",
      totalLaunches: 3,
      graduatedCount: 3,
      abandonedCount: 0,
      activeCount: 0,
      medianSurvivalSeconds: null,
      medianPeakMultiple: null,
    });
    expect(s.successfulLaunchRatio).toBeNull();
  });
});
