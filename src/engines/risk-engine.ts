/**
 * Risk Engine — every automated trade MUST pass here.
 * Fail closed. Never approve on error.
 */

import type { RiskCheckResult } from "@/types";

export interface RiskContext {
  userId: string;
  walletId: string;
  strategyId?: string;
  amountSol: number;
  mint: string;
  dailyRealizedPnlSol: number;
  currentExposureSol: number;
  openPositionCount: number;
  lastTradeAt: Date | null;
  emergencyStop: boolean;
  maxDailyLossSol: number;
  maxPerTradeSol: number;
  maxWalletExposureSol: number;
  maxConcurrentPositions: number;
  cooldownSeconds: number;
  existingPositionForMint: boolean;
  recentIdempotencyKey?: string;
}

export class RiskEngine {
  evaluate(ctx: RiskContext): RiskCheckResult {
    const checks = {
      dailyLossCap: true,
      maxPerTrade: true,
      maxExposure: true,
      maxPositions: true,
      slippage: true,
      cooldown: true,
      emergencyStop: true,
      duplicate: true,
    };

    let reason: string | undefined;

    if (ctx.emergencyStop) {
      checks.emergencyStop = false;
      reason = "Emergency stop is active. New automated entries are blocked.";
    }

    if (ctx.amountSol > ctx.maxPerTradeSol) {
      checks.maxPerTrade = false;
      reason = `Trade size ${ctx.amountSol} SOL exceeds max per-trade limit ${ctx.maxPerTradeSol} SOL.`;
    }

    if (ctx.currentExposureSol + ctx.amountSol > ctx.maxWalletExposureSol) {
      checks.maxExposure = false;
      reason = `Would exceed max wallet exposure ${ctx.maxWalletExposureSol} SOL.`;
    }

    if (ctx.openPositionCount >= ctx.maxConcurrentPositions) {
      checks.maxPositions = false;
      reason = `Maximum concurrent positions (${ctx.maxConcurrentPositions}) reached.`;
    }

    if (ctx.dailyRealizedPnlSol < 0 && Math.abs(ctx.dailyRealizedPnlSol) >= ctx.maxDailyLossSol) {
      checks.dailyLossCap = false;
      reason = `Daily loss cap of ${ctx.maxDailyLossSol} SOL reached.`;
    }

    if (ctx.lastTradeAt) {
      const elapsed = (Date.now() - ctx.lastTradeAt.getTime()) / 1000;
      if (elapsed < ctx.cooldownSeconds) {
        checks.cooldown = false;
        reason = `Cooldown active. Wait ${Math.ceil(ctx.cooldownSeconds - elapsed)}s.`;
      }
    }

    if (ctx.existingPositionForMint) {
      checks.duplicate = false;
      reason = "Position already open for this token.";
    }

    const approved = Object.values(checks).every(Boolean);

    return {
      approved,
      reason: approved ? undefined : reason,
      checks,
    };
  }
}

export const riskEngine = new RiskEngine();
