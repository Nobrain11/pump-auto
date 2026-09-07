import { NextResponse } from "next/server";
import { getCurrentUser, ensureDevUser, createSession } from "@/lib/auth/session";
import { positionService } from "@/lib/positions/position-service";
import { walletService } from "@/lib/solana/wallet-service";

export const dynamic = "force-dynamic";

export async function GET() {
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

    try {
      await positionService.refreshUnrealized(user.id);
    } catch {
      // keep last stored unrealized
    }

    const summary = await positionService.portfolioSummary(user.id);

    const wallets = await walletService.listWallets(user.id);
    let totalSol = 0;
    const walletBalances = [];
    for (const w of wallets) {
      try {
        const bal = await walletService.getBalance(w.id, user.id);
        totalSol += bal;
        walletBalances.push({ ...w, balanceSol: bal });
      } catch {
        walletBalances.push({ ...w, balanceSol: null });
      }
    }

    return NextResponse.json({
      totalSol,
      realizedPnlSol: summary.realizedPnlSol,
      unrealizedPnlSol: summary.unrealizedPnlSol,
      exposureSol: summary.exposureSol,
      positionCount: summary.positionCount,
      positions: summary.positions.map((p) => ({
        id: p.id,
        mint: p.mint,
        entryAmountSol: Number(p.entryAmountSol),
        currentAmountToken: Number(p.currentAmountToken),
        realizedPnlSol: Number(p.realizedPnlSol),
        unrealizedPnlSol: Number(p.unrealizedPnlSol),
        highestPnlPct: Number(p.highestPnlPct),
        maxDrawdownPct: Number(p.maxDrawdownPct),
        status: p.status,
        openedAt: p.openedAt,
      })),
      wallets: walletBalances,
      asOf: new Date().toISOString(),
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Portfolio failed";
    if (message.includes("DATABASE") || message.includes("Prisma") || message.includes("connect")) {
      return NextResponse.json({
        totalSol: 0,
        realizedPnlSol: 0,
        unrealizedPnlSol: 0,
        exposureSol: 0,
        positionCount: 0,
        positions: [],
        wallets: [],
        note: "Database not connected. No fabricated balances.",
        asOf: new Date().toISOString(),
      });
    }
    console.error("[portfolio]", message);
    return NextResponse.json({ error: "Failed to load portfolio" }, { status: 500 });
  }
}
