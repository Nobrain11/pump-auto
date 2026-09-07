/**
 * Developer Intelligence + Follow service
 * Scores only from measurable on-chain stats.
 * Auto-buy goes through the same risk engine as Auto-Hunter.
 */

import { v4 as uuidv4 } from "uuid";
import { prisma } from "@/lib/db/prisma";
import {
  computeDeveloperScore,
  type DeveloperRawStats,
} from "@/engines/developer-scoring";
import { recordActivity } from "@/lib/activity";
import { orderService } from "@/lib/orders/order-service";
import type { RiskContext } from "@/engines/risk-engine";

export class DeveloperService {
  async upsertFromStats(raw: DeveloperRawStats) {
    const scored = computeDeveloperScore(raw);

    const dev = await prisma.developer.upsert({
      where: { address: raw.address },
      create: {
        id: uuidv4(),
        address: raw.address,
        totalLaunches: raw.totalLaunches,
        graduatedCount: raw.graduatedCount,
        abandonedCount: raw.abandonedCount,
        activeCount: raw.activeCount,
        medianSurvivalSeconds: raw.medianSurvivalSeconds,
        medianPeakMultiple: raw.medianPeakMultiple,
        successfulLaunchRatio: scored.successfulLaunchRatio,
        sampleSize: scored.sampleSize,
        confidence: scored.confidence,
        riskIndicators: raw.riskIndicators || [],
        lastLaunchAt: new Date(),
      },
      update: {
        totalLaunches: raw.totalLaunches,
        graduatedCount: raw.graduatedCount,
        abandonedCount: raw.abandonedCount,
        activeCount: raw.activeCount,
        medianSurvivalSeconds: raw.medianSurvivalSeconds,
        medianPeakMultiple: raw.medianPeakMultiple,
        successfulLaunchRatio: scored.successfulLaunchRatio,
        sampleSize: scored.sampleSize,
        confidence: scored.confidence,
        riskIndicators: raw.riskIndicators || [],
        updatedAt: new Date(),
      },
    });

    await prisma.developerScore.create({
      data: {
        id: uuidv4(),
        developerId: dev.id,
        score: scored.score,
        confidence: scored.confidence,
        components: {
          totalLaunches: raw.totalLaunches,
          graduatedCount: raw.graduatedCount,
          abandonedCount: raw.abandonedCount,
          medianPeakMultiple: raw.medianPeakMultiple,
          sampleSize: scored.sampleSize,
        },
      },
    });

    return { developer: dev, stats: scored };
  }

  async getByAddress(address: string) {
    return prisma.developer.findUnique({
      where: { address },
      include: {
        scores: { orderBy: { computedAt: "desc" }, take: 1 },
        launches: { orderBy: { launchedAt: "desc" }, take: 20 },
      },
    });
  }

  async follow(params: {
    userId: string;
    developerId: string;
    tradeAmountSol?: number;
    minDevScore?: number;
    maxPositions?: number;
    maxDailyExposureSol?: number;
    minLiquidityUsd?: number;
    cooldownSeconds?: number;
    autoBuy?: boolean;
    alertsEnabled?: boolean;
  }) {
    return prisma.developerFollow.upsert({
      where: {
        userId_developerId: {
          userId: params.userId,
          developerId: params.developerId,
        },
      },
      create: {
        id: uuidv4(),
        userId: params.userId,
        developerId: params.developerId,
        tradeAmountSol: params.tradeAmountSol ?? 0.25,
        minDevScore: params.minDevScore ?? 70,
        maxPositions: params.maxPositions ?? 2,
        maxDailyExposureSol: params.maxDailyExposureSol ?? 1,
        minLiquidityUsd: params.minLiquidityUsd ?? 10000,
        cooldownSeconds: params.cooldownSeconds ?? 1800,
        autoBuy: params.autoBuy ?? false,
        alertsEnabled: params.alertsEnabled ?? true,
      },
      update: {
        tradeAmountSol: params.tradeAmountSol,
        minDevScore: params.minDevScore,
        maxPositions: params.maxPositions,
        maxDailyExposureSol: params.maxDailyExposureSol,
        minLiquidityUsd: params.minLiquidityUsd,
        cooldownSeconds: params.cooldownSeconds,
        autoBuy: params.autoBuy,
        alertsEnabled: params.alertsEnabled,
        isActive: true,
      },
    });
  }

  async listFollows(userId: string) {
    return prisma.developerFollow.findMany({
      where: { userId, isActive: true },
      include: {
        developer: {
          include: {
            scores: { orderBy: { computedAt: "desc" }, take: 1 },
          },
        },
      },
    });
  }

  async onDeveloperLaunch(params: {
    developerAddress: string;
    mint: string;
    liquidityUsd: number | null;
    walletIdForUser: (userId: string) => Promise<string | null>;
  }) {
    const dev = await prisma.developer.findUnique({
      where: { address: params.developerAddress },
      include: {
        scores: { orderBy: { computedAt: "desc" }, take: 1 },
        follows: { where: { isActive: true } },
      },
    });
    if (!dev || dev.follows.length === 0) return;

    const devScore = dev.scores[0]?.score ?? 0;

    for (const follow of dev.follows) {
      await recordActivity({
        userId: follow.userId,
        type: "SMART_DEV_LAUNCH",
        message: `Tracked developer launched ${params.mint.slice(0, 8)}… (dev score ${devScore})`,
        severity: "INFO",
        metadata: {
          mint: params.mint,
          developerAddress: params.developerAddress,
          devScore,
        },
      });

      if (!follow.autoBuy) continue;

      if (devScore < follow.minDevScore) continue;

      if (
        params.liquidityUsd != null &&
        params.liquidityUsd < Number(follow.minLiquidityUsd)
      ) {
        continue;
      }

      const walletId = await params.walletIdForUser(follow.userId);
      if (!walletId) continue;

      const amountSol = Number(follow.tradeAmountSol);
      const riskContext: RiskContext = {
        userId: follow.userId,
        walletId,
        amountSol,
        mint: params.mint,
        dailyRealizedPnlSol: 0,
        currentExposureSol: 0,
        openPositionCount: 0,
        lastTradeAt: null,
        emergencyStop: false,
        maxDailyLossSol: 1,
        maxPerTradeSol: amountSol,
        maxWalletExposureSol: Number(follow.maxDailyExposureSol),
        maxConcurrentPositions: follow.maxPositions,
        cooldownSeconds: follow.cooldownSeconds,
        existingPositionForMint: false,
      };

      try {
        await orderService.createAndRiskCheck({
          userId: follow.userId,
          walletId,
          mint: params.mint,
          side: "BUY",
          amountSol,
          riskContext,
        });
      } catch (err) {
        console.error(
          "[smart-dev] auto-buy failed:",
          err instanceof Error ? err.message : err
        );
      }
    }
  }
}

export const developerService = new DeveloperService();
