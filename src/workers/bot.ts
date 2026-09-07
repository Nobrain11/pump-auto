/**
 * PUMP AUTO — Bot supervisor
 * Runs scanner + execution + position loops in one process (Railway worker service).
 *
 *   npm run worker:bot
 *
 * Env required:
 *   DATABASE_URL, SOLANA_RPC_URL, WALLET_ENCRYPTION_KEY
 * Optional:
 *   REDIS_URL, JUPITER_API_URL, JUPITER_API_KEY, HELIUS_RPC_URL
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
  const discovered = await discovery.getRecentTokens(25);
  const opportunities = analyzeBatch(discovered, DEFAULT_FILTERS);
  const passed = opportunities.filter((o) => o.passedFilters);
  console.log(
    `[scanner] discovered=${discovered.length} scored=${opportunities.length} passed=${passed.length}`
  );
  for (const opp of passed.slice(0, 5)) {
    console.log(
      `  ✓ ${opp.symbol || opp.mint.slice(0, 8)} score=${opp.score.overall} risk=${opp.score.risk}`
    );
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
      if (pos.takeProfitPct != null && pnlPct >= Number(pos.takeProfitPct)) exitReason = "TP";
      else if (pos.stopLossPct != null && pnlPct <= -Math.abs(Number(pos.stopLossPct)))
        exitReason = "SL";
      else if (
        pos.trailingStopPct != null &&
        highest - pnlPct >= Number(pos.trailingStopPct)
      )
        exitReason = "TRAILING";

      if (!exitReason) continue;

      const amountSolApprox =
        Number(pos.entryAmountSol) *
        (Number(pos.currentAmountToken) / Math.max(Number(pos.entryAmountToken), 1e-18));

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
        maxPerTradeSol: amountSolApprox + 1,
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
          riskContext: riskCtx,
        });
      } catch (err) {
        console.error(
          `[position] enqueue ${exitReason} failed:`,
          err instanceof Error ? err.message : err
        );
      }
    }
  }
}

async function loop(name: string, fn: () => Promise<unknown>, intervalMs: number) {
  for (;;) {
    try {
      await fn();
    } catch (err) {
      console.error(
        `[${name}]`,
        err instanceof Error ? redactSecrets(err.message) : err
      );
    }
    await sleep(intervalMs);
  }
}

async function main() {
  console.log("[bot] PUMP AUTO worker starting");
  console.log("[bot] NODE_ENV=", process.env.NODE_ENV);
  console.log("[bot] intervals scanner/exec/pos", SCANNER_MS, EXECUTION_MS, POSITION_MS);

  const missing: string[] = [];
  if (!process.env.DATABASE_URL) missing.push("DATABASE_URL");
  if (!process.env.SOLANA_RPC_URL && !process.env.HELIUS_RPC_URL)
    missing.push("SOLANA_RPC_URL|HELIUS_RPC_URL");
  if (!process.env.WALLET_ENCRYPTION_KEY) missing.push("WALLET_ENCRYPTION_KEY");
  if (!process.env.TELEGRAM_BOT_TOKEN) {
    console.warn("[bot] TELEGRAM_BOT_TOKEN is not configured; Telegram commands require the web webhook route and token.");
  }
  if (missing.length) {
    console.warn("[bot] missing env (some features will fail):", missing.join(", "));
  }

  await Promise.all([
    loop("scanner", scannerTick, SCANNER_MS),
    loop(
      "execution",
      async () => {
        let worked = true;
        while (worked) {
          worked = await executionTick();
        }
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
