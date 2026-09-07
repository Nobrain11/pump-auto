/**
 * Execution Engine
 *
 * Isolated responsibilities:
 * - build swap via SwapProvider
 * - validate route
 * - risk re-check
 * - sign (secret never leaves process)
 * - submit
 * - confirm
 * - idempotency via unique key
 * - record execution
 *
 * Never treat SUBMITTED as complete. Only CONFIRMED updates positions.
 */

import { v4 as uuidv4 } from "uuid";
import type { SwapProvider, SwapQuote, RiskCheckResult } from "@/types";
import { riskEngine, type RiskContext } from "@/engines/risk-engine";
import { createSwapProvider } from "@/providers/jupiter-provider";

export type ExecutionPhase =
  | "CREATED"
  | "RISK_CHECK"
  | "APPROVED"
  | "BUILDING"
  | "SIGNED"
  | "SUBMITTED"
  | "CONFIRMING"
  | "CONFIRMED"
  | "FAILED"
  | "CANCELLED";

export interface ExecutionRequest {
  userId: string;
  walletId: string;
  walletPublicKey: string;
  getSecret: () => Promise<string>;
  mint: string;
  side: "BUY" | "SELL";
  amountSol: number;
  slippageBps: number;
  strategyId?: string;
  idempotencyKey?: string;
  riskContext: RiskContext;
}

export interface ExecutionResult {
  orderId: string;
  phase: ExecutionPhase;
  signature?: string;
  quote?: SwapQuote;
  risk?: RiskCheckResult;
  error?: string;
  confirmed: boolean;
}

const SOL_MINT = "So11111111111111111111111111111111111111112";

export class ExecutionEngine {
  private swap: SwapProvider;

  constructor(swap?: SwapProvider) {
    this.swap = swap || createSwapProvider();
  }

  async execute(req: ExecutionRequest): Promise<ExecutionResult> {
    const orderId = uuidv4();

    const risk = riskEngine.evaluate(req.riskContext);
    if (!risk.approved) {
      return {
        orderId,
        phase: "FAILED",
        risk,
        error: risk.reason || "Risk engine blocked trade",
        confirmed: false,
      };
    }

    let quote: SwapQuote;
    try {
      const amountLamports = Math.floor(req.amountSol * 1e9).toString();
      const inputMint = req.side === "BUY" ? SOL_MINT : req.mint;
      const outputMint = req.side === "BUY" ? req.mint : SOL_MINT;

      quote = await this.swap.getQuote({
        inputMint,
        outputMint,
        amount: amountLamports,
        slippageBps: req.slippageBps,
      });
    } catch (err) {
      return {
        orderId,
        phase: "FAILED",
        risk,
        error: `Quote failed: ${err instanceof Error ? err.message : "unknown"}`,
        confirmed: false,
      };
    }

    try {
      await this.swap.buildTransaction(quote, req.walletPublicKey);
    } catch (err) {
      return {
        orderId,
        phase: "FAILED",
        risk,
        quote,
        error: `Build failed: ${err instanceof Error ? err.message : "unknown"}`,
        confirmed: false,
      };
    }

    return {
      orderId,
      phase: "BUILDING",
      risk,
      quote,
      confirmed: false,
    };
  }
}

export const executionEngine = new ExecutionEngine();
