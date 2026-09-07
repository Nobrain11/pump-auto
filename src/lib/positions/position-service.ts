/**
 * Position Service
 * Positions open only from CONFIRMED buy orders.
 * PnL from confirmed exits + live market prices for unrealized.
 */

import { v4 as uuidv4 } from "uuid";
import { prisma } from "@/lib/db/prisma";
import { recordActivity } from "@/lib/activity";
import { createMarketDataProvider } from "@/providers/market-data-provider";

export class PositionService {
  async openFromConfirmedBuy(params: {
    userId: string;
    walletId: string;
    orderId: string;
    strategyId?: string;
    tokenId?: string;
    mint: string;
    entryAmountSol: number;
    entryAmountToken: number;
    entryPriceUsd: number;
    takeProfitPct?: number;
    stopLossPct?: number;
    trailingStopPct?: number;
  }) {
    const position = await prisma.position.create({
      data: {
        id: uuidv4(),
        userId: params.userId,
        walletId: params.walletId,
        orderId: params.orderId,
        strategyId: params.strategyId,
        tokenId: params.tokenId,
        mint: params.mint,
        entryPriceUsd: params.entryPriceUsd,
        entryAmountSol: params.entryAmountSol,
        entryAmountToken: params.entryAmountToken,
        currentAmountToken: params.entryAmountToken,
        status: "OPEN",
        takeProfitPct: params.takeProfitPct,
        stopLossPct: params.stopLossPct,
        trailingStopPct: params.trailingStopPct,
      },
    });

    await recordActivity({
      userId: params.userId,
      walletId: params.walletId,
      type: "POSITION_OPENED",
      message: `Position opened: ${params.entryAmountSol} SOL → ${params.mint.slice(0, 8)}…`,
      severity: "SUCCESS",
      metadata: { positionId: position.id, orderId: params.orderId },
    });

    return position;
  }

  async recordExit(params: {
    positionId: string;
    amountToken: number;
    amountSol: number;
    priceUsd: number;
    pnlSol: number;
    reason?: string;
    signature?: string;
  }) {
    const position = await prisma.position.findUniqueOrThrow({
      where: { id: params.positionId },
    });

    await prisma.positionExit.create({
      data: {
        id: uuidv4(),
        positionId: params.positionId,
        amountToken: params.amountToken,
        amountSol: params.amountSol,
        priceUsd: params.priceUsd,
        pnlSol: params.pnlSol,
        reason: params.reason || "MANUAL",
        signature: params.signature,
      },
    });

    const newTokenAmount =
      Number(position.currentAmountToken) - params.amountToken;
    const newRealized = Number(position.realizedPnlSol) + params.pnlSol;

    const status =
      newTokenAmount <= 0
        ? "CLOSED"
        : newTokenAmount < Number(position.entryAmountToken)
          ? "PARTIAL"
          : "OPEN";

    const updated = await prisma.position.update({
      where: { id: params.positionId },
      data: {
        currentAmountToken: Math.max(0, newTokenAmount),
        realizedPnlSol: newRealized,
        status,
        closedAt: status === "CLOSED" ? new Date() : undefined,
        unrealizedPnlSol: status === "CLOSED" ? 0 : undefined,
      },
    });

    await recordActivity({
      userId: position.userId,
      walletId: position.walletId,
      type: "POSITION_EXIT",
      message: `Exit ${params.reason || "MANUAL"}: ${params.pnlSol >= 0 ? "+" : ""}${params.pnlSol.toFixed(4)} SOL`,
      severity: params.pnlSol >= 0 ? "SUCCESS" : "WARNING",
      metadata: { positionId: params.positionId, signature: params.signature },
    });

    return updated;
  }

  async refreshUnrealized(userId: string) {
    const open = await prisma.position.findMany({
      where: { userId, status: { in: ["OPEN", "PARTIAL"] } },
    });

    if (open.length === 0) return [];

    const market = createMarketDataProvider();
    const mints = [...new Set(open.map((p) => p.mint))];
    let snapshots: Awaited<ReturnType<typeof market.getTokenSnapshots>> = [];
    try {
      snapshots = await market.getTokenSnapshots(mints);
    } catch {
      return open;
    }
    const priceByMint = new Map(
      snapshots.filter((s) => s.priceUsd != null).map((s) => [s.mint, s.priceUsd!])
    );

    const results = [];
    for (const pos of open) {
      const price = priceByMint.get(pos.mint);
      if (price == null) {
        results.push(pos);
        continue;
      }

      const remainingFraction =
        Number(pos.entryAmountToken) > 0
          ? Number(pos.currentAmountToken) / Number(pos.entryAmountToken)
          : 0;
      const costBasisSol = Number(pos.entryAmountSol) * remainingFraction;
      const pnlPct =
        Number(pos.entryPriceUsd) > 0
          ? (price - Number(pos.entryPriceUsd)) / Number(pos.entryPriceUsd)
          : 0;
      const unrealizedPnlSol = costBasisSol * pnlPct;

      const highest = Math.max(Number(pos.highestPnlPct), pnlPct * 100);
      const drawdown = Math.min(Number(pos.maxDrawdownPct), pnlPct * 100);

      const updated = await prisma.position.update({
        where: { id: pos.id },
        data: {
          unrealizedPnlSol,
          highestPnlPct: highest,
          maxDrawdownPct: drawdown,
        },
      });
      results.push(updated);
    }

    return results;
  }

  async listOpen(userId: string) {
    return prisma.position.findMany({
      where: { userId, status: { in: ["OPEN", "PARTIAL"] } },
      orderBy: { openedAt: "desc" },
    });
  }

  async portfolioSummary(userId: string) {
    const positions = await this.listOpen(userId);
    const realizedAgg = await prisma.position.aggregate({
      where: { userId },
      _sum: { realizedPnlSol: true },
    });

    let unrealized = 0;
    let exposure = 0;
    for (const p of positions) {
      unrealized += Number(p.unrealizedPnlSol);
      exposure +=
        Number(p.entryAmountSol) *
        (Number(p.currentAmountToken) / Math.max(Number(p.entryAmountToken), 1e-18));
    }

    return {
      realizedPnlSol: Number(realizedAgg._sum.realizedPnlSol || 0),
      unrealizedPnlSol: unrealized,
      exposureSol: exposure,
      positionCount: positions.length,
      positions,
    };
  }
}

export const positionService = new PositionService();
