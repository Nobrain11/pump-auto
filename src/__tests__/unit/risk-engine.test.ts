import { describe, it, expect } from "vitest";
import { riskEngine, type RiskContext } from "@/engines/risk-engine";

const base: RiskContext = {
  userId: "u1",
  walletId: "w1",
  amountSol: 0.25,
  mint: "TokenMint",
  dailyRealizedPnlSol: 0,
  currentExposureSol: 1,
  openPositionCount: 1,
  lastTradeAt: null,
  emergencyStop: false,
  maxDailyLossSol: 1,
  maxPerTradeSol: 0.5,
  maxWalletExposureSol: 5,
  maxConcurrentPositions: 5,
  cooldownSeconds: 60,
  existingPositionForMint: false,
};

describe("riskEngine", () => {
  it("approves a normal trade", () => {
    const r = riskEngine.evaluate(base);
    expect(r.approved).toBe(true);
  });

  it("blocks on emergency stop", () => {
    const r = riskEngine.evaluate({ ...base, emergencyStop: true });
    expect(r.approved).toBe(false);
    expect(r.checks.emergencyStop).toBe(false);
  });

  it("blocks oversize trade", () => {
    const r = riskEngine.evaluate({ ...base, amountSol: 2, maxPerTradeSol: 0.5 });
    expect(r.approved).toBe(false);
    expect(r.checks.maxPerTrade).toBe(false);
  });

  it("blocks when daily loss cap hit", () => {
    const r = riskEngine.evaluate({
      ...base,
      dailyRealizedPnlSol: -1.5,
      maxDailyLossSol: 1,
    });
    expect(r.approved).toBe(false);
    expect(r.checks.dailyLossCap).toBe(false);
  });

  it("blocks duplicate mint position", () => {
    const r = riskEngine.evaluate({ ...base, existingPositionForMint: true });
    expect(r.approved).toBe(false);
    expect(r.checks.duplicate).toBe(false);
  });

  it("blocks during cooldown", () => {
    const r = riskEngine.evaluate({
      ...base,
      lastTradeAt: new Date(),
      cooldownSeconds: 300,
    });
    expect(r.approved).toBe(false);
    expect(r.checks.cooldown).toBe(false);
  });
});
