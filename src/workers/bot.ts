/**
 * PUMP AUTO — Bot supervisor
 * scanner + execution + position + Telegram
 * Auto-entry when hunter is active (Redis-shared START).
 */

import { createTokenDiscovery } from "@/lib/solana/token-discovery";
import { analyzeBatch, DEFAULT_FILTERS } from "@/engines/scanner-pipeline";
import { orderService } from "@/lib/orders/order-service";
import { positionService } from "@/lib/positions/position-service";
import { walletService } from "@/lib/solana/wallet-service";
import { createSwapProvider } from "@/providers/jupiter-provider";
import { createSolanaProvider } from "@/providers/solana-provider";
import { createMarketDataProvider } from "@/providers/market-data-provider";
import { recordActivity } from "@/lib/activity";
import { type RiskContext } from "@/engines/risk-engine";
import { redactSecrets } from "@/lib/security/wallet-encryption";
import { prisma } from "@/lib/db/prisma";
import { Keypair, VersionedTransaction } from "@solana/web3.js";
import bs58 from "bs58";
import type { Prisma } from "@prisma/client";
import { telegramLoop, isTelegramEnabled } from "@/lib/telegram/bot";
import {
  getHunterState,
  setHunterState,
  isHunterActive,
} from "@/lib/hunter/state";

const SOL_MINT = "So11111111111111111111111111111111111111112";
const SCANNER_MS = Number(process.env.BOT_SCANNER_MS || 20_000);
const EXECUTION_MS = Number(process.env.BOT_EXECUTION_MS || 2_500);
const POSITION_MS = Number(process.env.BOT_POSITION_MS || 8_000);

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

function signSwapTransaction(swapTransactionBase64: string, secretKeyBase58: string): Uint8Array {
  const secret = bs58.decode(secretKeyBase58);
  const keypair = Keypair.fromSecretKey(secret);
  const txBuf = Buffer.from(swapTransactionBase64, "base64");
  const tx = VersionedTransaction.deserialize(txBuf);
  tx.sign([keypair]);
  return tx.serialize();
}

async function scannerTick() {
  const discovery = createTokenDiscovery();
  const discovered = await discovery.getRecentTokens(30);
  const opportunities = analyzeBatch(discovered, DEFAULT_FILTERS);
  const passed = opportunities.filter((o) => o.passedFilters);

  const hunter = await getHunterState();
  await setHunterState({
    opportunitiesFound: discovered.length,
    passedFilters: passed.length,
    lastScanAt: new Date().toISOString(),
  });

  console.log(
    `[scanner] state=${hunter.state} discovered=${discovered.length} passed=${passed.length}`
  );
  for (const opp of passed.slice(0, 5)) {
    console.log(
      `  ✓ ${opp.symbol || opp.mint.slice(0, 8)} score=${opp.score.overall} risk=${opp.score.risk}`
    );
  }

  if (!isHunterActive(hunter)) return;

  const tradeSol = Number(process.env.BOT_TRADE_SOL || "0.05");
  if (!(tradeSol > 0) || tradeSol > 2) {
    console.warn("[scanner] BOT_TRADE_SOL invalid");
    return;
  }

  const wallets = await prisma.wallet.findMany({
    where: { isActive: true, isPrimary: true },
    select: { id: true, userId: true },
    take: 20,
  });
  if (wallets.length === 0) {
    console.log("[scanner] no primary wallets — create wallet in app first");
    return;
  }

  const top = passed
    .slice()
    .sort((a, b) => b.score.overall - a.score.overall)
    .slice(0, 3);

  let entries = 0;
  for (const opp of top) {
    for (const w of wallets) {
      const existing = await prisma.position.findFirst({
        where: {
          userId: w.userId,
          mint: opp.mint,
          status: { in: ["OPEN", "PARTIAL"] },
        },
      });
      if (existing) continue;

      const recent = await prisma.order.findFirst({
        where: {
          userId: w.userId,
          mint: opp.mint,
          side: "BUY",
          createdAt: { gte: new Date(Date.now() - 30 * 60_000) },
        },
      });
      if (recent) continue;

      const openCount = await prisma.position.count({
        where: { userId: w.userId, status: { in: ["OPEN", "PARTIAL"] } },
      });

      const riskCtx: RiskContext = {
        userId: w.userId,
        walletId: w.id,
        amountSol: tradeSol,
        mint: opp.mint,
        dailyRealizedPnlSol: 0,
        currentExposureSol: tradeSol * openCount,
        openPositionCount: openCount,
        lastTradeAt: null,
        emergencyStop: hunter.emergencyStop,
        maxDailyLossSol: Number(process.env.BOT_MAX_DAILY_LOSS_SOL || "1"),
        maxPerTradeSol: Number(process.env.BOT_MAX_PER_TRADE_SOL || "0.25"),
        maxWalletExposureSol: Number(process.env.BOT_MAX_EXPOSURE_SOL || "1"),
        maxConcurrentPositions: Number(process.env.BOT_MAX_POSITIONS || "5"),
        cooldownSeconds: 60,
        existingPositionForMint: false,
      };

      try {
        const { order, risk } = await orderService.createAndRiskCheck({
          userId: w.userId,
          walletId: w.id,
          mint: opp.mint,
          side: "BUY",
          amountSol: tradeSol,
          riskContext: riskCtx,
        });
        if (risk.approved) {
          entries += 1;
          console.log(
            `[scanner] ENTRY queued ${opp.symbol || opp.mint.slice(0, 8)} ${tradeSol} SOL order=${order.id}`
          );
          await setHunterState({
            state: "EXECUTING",
            lastEntryMint: opp.mint,
            entriesToday: (hunter.entriesToday || 0) + 1,
          });
        } else {
          console.log(`[scanner] risk blocked: ${risk.reason}`);
        }
      } catch (err) {
        console.error("[scanner] entry failed:", err instanceof Error ? err.message : err);
      }
    }
  }

  if (entries === 0 && top.length) {
    console.log("[scanner] active but no new entries this tick");
  }
}

async function executionTick(): Promise<boolean> {
  const claimed = await orderService.claimNextApproved();
  if (!claimed) return false;

  const { id: orderId, userId, walletId, mint, side, amountSol, slippageBps, walletPublicKey } =
    claimed;
  console.log(`[execution] claimed ${orderId} ${side} ${amountSol} SOL`);

  const swap = createSwapProvider();
  const solana = createSolanaProvider();

  try {
    const amountLamports = Math.floor(amountSol * 1e9).toString();
    const inputMint = side === "BUY" ? SOL_MINT : mint;
    const outputMint = side === "BUY" ? mint : SOL_MINT;

    const quote = await swap.getQuote({
      inputMint,
      outputMint,
      amount: amountLamports,
      slippageBps: slippageBps ?? 300,
    });

    await orderService.transition(orderId, "BUILDING", {
      quote: quote as unknown as Prisma.InputJsonValue,
    });

    const swapTxB64 = await swap.buildTransaction(quote, walletPublicKey);
    const secret = await walletService.getDecryptedSecret(walletId, userId);
    const rawTx = signSwapTransaction(swapTxB64, secret);
    await orderService.transition(orderId, "SIGNED");

    const signature = await solana.sendRawTransaction(rawTx);
    await orderService.transition(orderId, "SUBMITTED", { signature });
    await orderService.transition(orderId, "CONFIRMING", { signature });

    const ok = await solana.confirmTransaction(signature, "confirmed");
    if (!ok) {
      await orderService.transition(orderId, "FAILED", {
        signature,
        errorMessage: "On-chain transaction failed",
      });
      return true;
    }

    await orderService.transition(orderId, "CONFIRMED", { signature });

    if (side === "BUY") {
      const outAmount = Number(quote.outAmount) / 1e6;
      const priceUsd = amountSol > 0 && outAmount > 0 ? amountSol / outAmount : 0;
      await positionService.openFromConfirmedBuy({
        userId,
        walletId,
        orderId,
        mint,
        entryAmountSol: amountSol,
        entryAmountToken: outAmount,
        entryPriceUsd: priceUsd,
      });
    }

    await recordActivity({
      userId,
      walletId,
      type: "TX_CONFIRMED",
      message: `Confirmed ${side} ${amountSol} SOL — ${signature.slice(0, 12)}…`,
      severity: "SUCCESS",
      metadata: { orderId, signature },
    });
    console.log(`[execution] CONFIRMED ${orderId}`);
  } catch (err) {
    const message = err instanceof Error ? err.message : "unknown";
    console.error(`[execution] ${orderId}:`, redactSecrets(message));
    await orderService.transition(orderId, "FAILED", {
      errorMessage: message.slice(0, 500),
    });
  }
  return true;
}

async function positionTick() {
  const users = await prisma.position.findMany({
    where: { status: { in: ["OPEN", "PARTIAL"] } },
    select: { userId: true },
    distinct: ["userId"],
  });

  for (const { userId } of users) {
    const open = await prisma.position.findMany({
      where: { userId, status: { in: ["OPEN", "PARTIAL"] } },
    });
    if (open.length === 0) continue;

    const market = createMarketDataProvider();
    const mints = [...new Set(open.map((p) => p.mint))];
    let snapshots;
    try {
      snapshots = await market.getTokenSnapshots(mints);
    } catch {
      continue;
    }
    const priceByMint = new Map(
      snapshots.filter((s) => s.priceUsd != null).map((s) => [s.mint, s.priceUsd as number])
    );

    for (const pos of open) {
      const price = priceByMint.get(pos.mint);
      if (price == null || Number(pos.entryPriceUsd) <= 0) continue;

      const pnlPct =
        ((price - Number(pos.entryPriceUsd)) / Number(pos.entryPriceUsd)) * 100;
      const highest = Math.max(Number(pos.highestPnlPct), pnlPct);

      await prisma.position.update({
        where: { id: pos.id },
        data: {
          highestPnlPct: highest,
          unrealizedPnlSol:
            Number(pos.entryAmountSol) *
            (Number(pos.currentAmountToken) /
              Math.max(Number(pos.entryAmountToken), 1e-18)) *
            (pnlPct / 100),
        },
      });
    }
  }
}

function isSchemaError(err: unknown): boolean {
  const msg = err instanceof Error ? err.message : String(err);
  return (
    msg.includes("does not exist") ||
    msg.includes("P2021") ||
    msg.includes("P1001") ||
    msg.includes("Can't reach database")
  );
}

async function ensureDatabase() {
  const url = process.env.DATABASE_URL;
  if (!url) {
    console.error("[bot] FATAL: DATABASE_URL is not set");
    process.exit(1);
  }
  if (url.includes("localhost") || url.includes("127.0.0.1")) {
    console.error("[bot] FATAL: DATABASE_URL points to localhost");
    process.exit(1);
  }

  for (let i = 1; i <= 30; i++) {
    try {
      await prisma.$queryRaw`SELECT 1`;
      console.log("[bot] database reachable");
      break;
    } catch {
      if (i === 30) process.exit(1);
      await sleep(2000);
    }
  }

  try {
    await prisma.$queryRaw`SELECT 1 FROM "Order" LIMIT 1`;
    console.log("[bot] schema present");
  } catch {
    console.warn("[bot] tables missing");
  }
}

async function loop(name: string, fn: () => Promise<unknown>, intervalMs: number) {
  for (;;) {
    try {
      await fn();
    } catch (err) {
      const msg = err instanceof Error ? redactSecrets(err.message) : String(err);
      if (isSchemaError(err)) {
        console.error(`[${name}] schema/db`, msg.slice(0, 200));
        await sleep(Math.max(intervalMs, 15_000));
        continue;
      }
      console.error(`[${name}]`, msg);
    }
    await sleep(intervalMs);
  }
}

async function main() {
  console.log("[bot] PUMP AUTO worker starting");
  await ensureDatabase();
  console.log("[bot] trade size SOL", process.env.BOT_TRADE_SOL || "0.05");

  if (isTelegramEnabled()) {
    telegramLoop().catch((err) => console.error("[telegram] fatal:", err));
  }

  await Promise.all([
    loop("scanner", scannerTick, SCANNER_MS),
    loop(
      "execution",
      async () => {
        let worked = true;
        while (worked) worked = await executionTick();
      },
      EXECUTION_MS
    ),
    loop("position", positionTick, POSITION_MS),
  ]);
}

main().catch((err) => {
  console.error("[bot] fatal:", err);
  process.exit(1);
});
