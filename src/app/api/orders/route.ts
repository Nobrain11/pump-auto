import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { v4 as uuidv4 } from "uuid";
import { getCurrentUser, ensureDevUser, createSession } from "@/lib/auth/session";
import { riskEngine, type RiskContext } from "@/engines/risk-engine";

export const dynamic = "force-dynamic";

const CreateOrderSchema = z.object({
  walletId: z.string().uuid().optional(),
  mint: z.string().min(32).max(64),
  side: z.enum(["BUY", "SELL"]),
  amountSol: z.number().positive().max(100),
  slippageBps: z.number().int().min(10).max(3000).optional(),
  strategyId: z.string().uuid().optional(),
});

export async function POST(req: NextRequest) {
  try {
    let user = await getCurrentUser();
    if (!user && process.env.NODE_ENV === "development") {
      const userId = await ensureDevUser();
      await createSession(userId);
      user = await getCurrentUser();
    }
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await req.json();
    const parsed = CreateOrderSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Invalid order", details: parsed.error.flatten() },
        { status: 400 }
      );
    }

    const { mint, side, amountSol, strategyId } = parsed.data;
    const slippageBps = parsed.data.slippageBps ?? 300;

    const riskCtx: RiskContext = {
      userId: user.id,
      walletId: parsed.data.walletId || "pending",
      strategyId,
      amountSol,
      mint,
      dailyRealizedPnlSol: 0,
      currentExposureSol: 0,
      openPositionCount: 0,
      lastTradeAt: null,
      emergencyStop: false,
      maxDailyLossSol: 1,
      maxPerTradeSol: 0.5,
      maxWalletExposureSol: 5,
      maxConcurrentPositions: 5,
      cooldownSeconds: 60,
      existingPositionForMint: false,
    };

    const risk = riskEngine.evaluate(riskCtx);
    if (!risk.approved) {
      return NextResponse.json(
        {
          error: "TRADE BLOCKED",
          reason: risk.reason,
          checks: risk.checks,
          note: "No transaction was submitted.",
        },
        { status: 403 }
      );
    }

    const orderId = uuidv4();
    const idempotencyKey = uuidv4();

    return NextResponse.json(
      {
        order: {
          id: orderId,
          userId: user.id,
          mint,
          side,
          amountSol,
          slippageBps,
          state: "APPROVED",
          riskApproved: true,
          idempotencyKey,
          createdAt: new Date().toISOString(),
        },
        message:
          "Order risk-approved. Execution worker will build, sign, submit and confirm. " +
          "Only CONFIRMED updates positions.",
      },
      { status: 201 }
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : "Order failed";
    console.error("[orders] POST:", message);
    return NextResponse.json({ error: "Failed to create order" }, { status: 500 });
  }
}

export async function GET() {
  return NextResponse.json({
    orders: [],
    note: "Connect DATABASE_URL + Prisma to list persisted orders.",
  });
}
