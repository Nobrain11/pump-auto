/**
 * Execution Worker
 * Claim APPROVED orders → quote → build → sign → submit → confirm
 * → open position on CONFIRMED only.
 * Restart-safe via order state machine + idempotencyKey.
 *
 *   npx tsx src/workers/execution-worker.ts
 */

import { Keypair, VersionedTransaction } from "@solana/web3.js";
import bs58 from "bs58";
import { createSwapProvider } from "@/providers/jupiter-provider";
import { createSolanaProvider } from "@/providers/solana-provider";
import { orderService } from "@/lib/orders/order-service";
import { positionService } from "@/lib/positions/position-service";
import { walletService } from "@/lib/solana/wallet-service";
import { recordActivity } from "@/lib/activity";
import { redactSecrets } from "@/lib/security/wallet-encryption";

const SOL_MINT = "So11111111111111111111111111111111111111112";
const POLL_MS = 2_500;

export function signSwapTransaction(
  swapTransactionBase64: string,
  secretKeyBase58: string
): Uint8Array {
  const secret = bs58.decode(secretKeyBase58);
  const keypair = Keypair.fromSecretKey(secret);
  const txBuf = Buffer.from(swapTransactionBase64, "base64");
  const tx = VersionedTransaction.deserialize(txBuf);
  tx.sign([keypair]);
  return tx.serialize();
}

async function processOne(): Promise<boolean> {
  const claimed = await orderService.claimNextApproved();
  if (!claimed) return false;

  const {
    id: orderId,
    userId,
    walletId,
    mint,
    side,
    amountSol,
    slippageBps,
    walletPublicKey,
  } = claimed;

  console.log(`[execution] claimed order ${orderId} ${side} ${amountSol} SOL`);

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
      quote: quote as unknown as object,
    });

    const swapTxB64 = await swap.buildTransaction(quote, walletPublicKey);

    let rawTx: Uint8Array;
    {
      const secret = await walletService.getDecryptedSecret(walletId, userId);
      rawTx = signSwapTransaction(swapTxB64, secret);
    }

    await orderService.transition(orderId, "SIGNED");

    const signature = await solana.sendRawTransaction(rawTx);
    await orderService.transition(orderId, "SUBMITTED", { signature });
    await orderService.transition(orderId, "CONFIRMING", { signature });

    await recordActivity({
      userId,
      walletId,
      type: "TX_SUBMITTED",
      message: `Submitted ${side} tx ${signature.slice(0, 12)}…`,
      severity: "INFO",
      metadata: { orderId, signature },
    });

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
      const priceUsd =
        amountSol > 0 && outAmount > 0 ? amountSol / outAmount : 0;

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
    console.error(`[execution] order ${orderId} failed:`, redactSecrets(message));
    await orderService.transition(orderId, "FAILED", {
      errorMessage: message.slice(0, 500),
    });
  }

  return true;
}

async function main() {
  console.log("[execution] worker starting");
  for (;;) {
    try {
      const worked = await processOne();
      if (!worked) await new Promise((r) => setTimeout(r, POLL_MS));
    } catch (err) {
      console.error("[execution] loop error:", err instanceof Error ? redactSecrets(err.message) : err);
      await new Promise((r) => setTimeout(r, POLL_MS));
    }
  }
}

main().catch((err) => {
  console.error("[execution] fatal:", err);
  process.exit(1);
});
