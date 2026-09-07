/**
 * Position Worker
 * Monitors open positions for take-profit, stop-loss, trailing stop.
 * Emits sell orders through the same risk + execution path (no bypass).
 *
 *   npx tsx src/workers/position-worker.ts
 */

import { prisma } from "@/lib/db/prisma";
import { createMarketDataProvider } from "@/providers/market-data-provider";
import { orderService } from "@/lib/orders/order-service";
import { riskEngine, type RiskContext } from "@/engines/risk-engine";
import { recordActivity } from "@/lib/activity";

const POLL_MS = 8_000;

async function monitorUserPositions(userId: string) {
  const open = await prisma.position.findMany({
    where: { userId, status: { in: ["OPEN", "PARTIAL"] } },
  });
  if (open.length === 0) return;

  const market = createMarketDataProvider();
  const mints = [...new Set(open.map((p) => p.mint))];
  let snapshots;
  try {
    snapshots = await market.getTokenSnapshots(mints);
  } catch {
    return;
  }
  const priceByMint = new Map(
    snapshots
      .filter((s) => s.priceUsd != null)
      .map((s) => [s.mint, s.priceUsd as number])
  );

  for (const pos of open) {
    const price = priceByMint.get(pos.mint);
    if (price == null || Number(pos.entryPriceUsd) <= 0) continue;

    const pnlPct =
      ((price - Number(pos.entryPriceUsd)) / Number(pos.entryPriceUsd)) * 100;

    const highest = Math.max(Number(pos.highestPnlPct), pnlPct);
    const drawdown = Math.min(Number(pos.maxDrawdownPct), pnlPct);
    await prisma.position.update({
      where: { id: pos.id },
      data: {
        highestPnlPct: highest,
        maxDrawdownPct: drawdown,
        unrealizedPnlSol:
          Number(pos.entryAmountSol) *
          (Number(pos.currentAmountToken) /
            Math.max(Number(pos.entryAmountToken), 1e-18)) *
          (pnlPct / 100),
      },
    });

    let exitReason: string | null = null;

    if (pos.takeProfitPct != null && pnlPct >= Number(pos.takeProfitPct)) {
      exitReason = "TP";
    } else if (pos.stopLossPct != null && pnlPct <= -Math.abs(Number(pos.stopLossPct))) {
      exitReason = "SL";
    } else if (
      pos.trailingStopPct != null &&
      highest - pnlPct >= Number(pos.trailingStopPct)
    ) {
      exitReason = "TRAILING";
    }

    if (!exitReason) continue;

    const amountSolApprox =
      Number(pos.entryAmountSol) *
      (Number(pos.currentAmountToken) /
        Math.max(Number(pos.entryAmountToken), 1e-18));

    const riskCtx: RiskContext = {
      userId: pos.userId,
      walletId: pos.walletId,
      amountSol: amountSolApprox,
      mint: pos.mint,
      dailyRealizedPnlSol: 0,
      currentExposureSol: amountSolApprox,
      openPositionCount: open.length,
      lastTradeAt: null,
      emergencyStop: false,
      maxDailyLossSol: 100,
      maxPerTradeSol: amountSolApprox + 0.01,
      maxWalletExposureSol: 100,
      maxConcurrentPositions: 50,
      cooldownSeconds: 0,
      existingPositionForMint: false,
    };

    await recordActivity({
      userId: pos.userId,
      walletId: pos.walletId,
      type: "EXIT_SIGNAL",
      message: `${exitReason} signal on ${pos.mint.slice(0, 8)}… at ${pnlPct.toFixed(1)}%`,
      severity: "INFO",
      metadata: { positionId: pos.id, pnlPct, exitReason },
    });

    try {
      await orderService.createAndRiskCheck({
        userId: pos.userId,
        walletId: pos.walletId,
        mint: pos.mint,
        side: "SELL",
        amountSol: amountSolApprox,
        strategyId: pos.strategyId || undefined,
        riskContext: {
          ...riskCtx,
          maxPerTradeSol: amountSolApprox + 1,
          emergencyStop: false,
        },
      });
    } catch (err) {
      console.error(
        `[position] failed to enqueue ${exitReason} for ${pos.id}:`,
        err instanceof Error ? err.message : err
      );
    }
  }
}

async function tick() {
  const users = await prisma.position.findMany({
    where: { status: { in: ["OPEN", "PARTIAL"] } },
    select: { userId: true },
    distinct: ["userId"],
  });

  for (const { userId } of users) {
    try {
      await monitorUserPositions(userId);
    } catch (err) {
      console.error(
        `[position] user ${userId}:`,
        err instanceof Error ? err.message : err
      );
    }
  }
}

async function main() {
  console.log("[position] worker starting — TP / SL / trailing monitor");
  for (;;) {
    try {
      await tick();
    } catch (err) {
      console.error("[position] tick error:", err instanceof Error ? err.message : err);
    }
    await new Promise((r) => setTimeout(r, POLL_MS));
  }
}

main().catch((err) => {
  console.error("[position] fatal:", err);
  process.exit(1);
});
