/**
 * Order Service — persistence + state transitions.
 * PostgreSQL is the source of truth. Redis used only for locks/idempotency.
 */

import { v4 as uuidv4 } from "uuid";
import { prisma } from "@/lib/db/prisma";
import { riskEngine, type RiskContext } from "@/engines/risk-engine";
import { recordActivity } from "@/lib/activity";

export type OrderSide = "BUY" | "SELL";

export interface CreateOrderInput {
  userId: string;
  walletId: string;
  mint: string;
  side: OrderSide;
  amountSol: number;
  slippageBps?: number;
  strategyId?: string;
  tokenId?: string;
  riskContext: RiskContext;
}

export class OrderService {
  async createAndRiskCheck(input: CreateOrderInput) {
    const idempotencyKey = uuidv4();
    const orderId = uuidv4();

    const risk = riskEngine.evaluate(input.riskContext);

    const order = await prisma.order.create({
      data: {
        id: orderId,
        userId: input.userId,
        walletId: input.walletId,
        strategyId: input.strategyId,
        tokenId: input.tokenId,
        mint: input.mint,
        side: input.side,
        amountSol: input.amountSol,
        state: risk.approved ? "APPROVED" : "FAILED",
        riskApproved: risk.approved,
        riskReason: risk.reason,
        slippageBps: input.slippageBps ?? 300,
        idempotencyKey,
      },
    });

    await recordActivity({
      userId: input.userId,
      walletId: input.walletId,
      type: risk.approved ? "ORDER_APPROVED" : "ORDER_BLOCKED",
      message: risk.approved
        ? `Order approved: ${input.side} ${input.amountSol} SOL of ${input.mint.slice(0, 8)}…`
        : `Trade blocked: ${risk.reason}`,
      severity: risk.approved ? "INFO" : "WARNING",
      metadata: { orderId, checks: risk.checks },
    });

    if (!risk.approved) {
      await prisma.riskEvent.create({
        data: {
          id: uuidv4(),
          userId: input.userId,
          type: "ORDER_BLOCKED",
          reason: risk.reason || "Risk engine rejected",
          metadata: { orderId, checks: risk.checks },
        },
      });
    }

    return { order, risk };
  }

  async transition(
    orderId: string,
    to: string,
    extra?: {
      signature?: string;
      errorMessage?: string;
      quote?: object;
    }
  ) {
    const data: Record<string, unknown> = {
      state: to,
      updatedAt: new Date(),
    };
    if (extra?.signature) data.signature = extra.signature;
    if (extra?.errorMessage) data.errorMessage = extra.errorMessage;
    if (extra?.quote) data.quote = extra.quote;
    if (to === "SUBMITTED") data.submittedAt = new Date();
    if (to === "CONFIRMED") data.confirmedAt = new Date();

    return prisma.order.update({
      where: { id: orderId },
      data,
    });
  }

  async claimNextApproved(): Promise<{
    id: string;
    userId: string;
    walletId: string;
    mint: string;
    side: string;
    amountSol: number;
    slippageBps: number | null;
    idempotencyKey: string;
    walletPublicKey: string;
  } | null> {
    const candidate = await prisma.order.findFirst({
      where: { state: "APPROVED" },
      orderBy: { createdAt: "asc" },
      include: {
        wallet: { select: { publicKey: true } },
      },
    });

    if (!candidate) return null;

    const updated = await prisma.order.updateMany({
      where: { id: candidate.id, state: "APPROVED" },
      data: { state: "BUILDING" },
    });

    if (updated.count === 0) return null;

    return {
      id: candidate.id,
      userId: candidate.userId,
      walletId: candidate.walletId,
      mint: candidate.mint,
      side: candidate.side,
      amountSol: Number(candidate.amountSol),
      slippageBps: candidate.slippageBps,
      idempotencyKey: candidate.idempotencyKey,
      walletPublicKey: candidate.wallet.publicKey,
    };
  }

  async listForUser(userId: string, limit = 30) {
    return prisma.order.findMany({
      where: { userId },
      orderBy: { createdAt: "desc" },
      take: limit,
      select: {
        id: true,
        mint: true,
        side: true,
        amountSol: true,
        state: true,
        riskApproved: true,
        riskReason: true,
        signature: true,
        errorMessage: true,
        createdAt: true,
        submittedAt: true,
        confirmedAt: true,
      },
    });
  }
}

export const orderService = new OrderService();
