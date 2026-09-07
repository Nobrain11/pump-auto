/**
 * Jupiter SwapProvider implementation.
 * Abstraction allows swapping routers later without rewriting execution engine.
 */

import type { SwapProvider, SwapQuote } from "@/types";

const DEFAULT_JUPITER_URL = "https://quote-api.jup.ag/v6";

export class JupiterSwapProvider implements SwapProvider {
  private baseUrl: string;
  private apiKey?: string;

  constructor(baseUrl?: string, apiKey?: string) {
    this.baseUrl = baseUrl || process.env.JUPITER_API_URL || DEFAULT_JUPITER_URL;
    this.apiKey = apiKey || process.env.JUPITER_API_KEY;
  }

  private headers(): HeadersInit {
    const h: HeadersInit = { "Content-Type": "application/json" };
    if (this.apiKey) {
      h["x-api-key"] = this.apiKey;
    }
    return h;
  }

  async getQuote(params: {
    inputMint: string;
    outputMint: string;
    amount: string;
    slippageBps: number;
  }): Promise<SwapQuote> {
    const url = new URL(`${this.baseUrl}/quote`);
    url.searchParams.set("inputMint", params.inputMint);
    url.searchParams.set("outputMint", params.outputMint);
    url.searchParams.set("amount", params.amount);
    url.searchParams.set("slippageBps", String(params.slippageBps));
    url.searchParams.set("onlyDirectRoutes", "false");

    const res = await fetch(url.toString(), {
      headers: this.headers(),
      next: { revalidate: 0 },
    });

    if (!res.ok) {
      const body = await res.text();
      throw new Error(`Jupiter quote failed: ${res.status} ${body}`);
    }

    const data = await res.json();

    return {
      inputMint: data.inputMint,
      outputMint: data.outputMint,
      inAmount: data.inAmount,
      outAmount: data.outAmount,
      priceImpactPct: parseFloat(data.priceImpactPct || "0"),
      slippageBps: params.slippageBps,
      routePlan: data.routePlan || [],
      otherAmountThreshold: data.otherAmountThreshold,
    };
  }

  async buildTransaction(quote: SwapQuote, userPublicKey: string): Promise<string> {
    const res = await fetch(`${this.baseUrl}/swap`, {
      method: "POST",
      headers: this.headers(),
      body: JSON.stringify({
        quoteResponse: quote,
        userPublicKey,
        wrapAndUnwrapSol: true,
        dynamicComputeUnitLimit: true,
        prioritizationFeeLamports: "auto",
      }),
    });

    if (!res.ok) {
      const body = await res.text();
      throw new Error(`Jupiter swap build failed: ${res.status} ${body}`);
    }

    const data = await res.json();
    if (!data.swapTransaction) {
      throw new Error("Jupiter did not return swapTransaction");
    }
    return data.swapTransaction as string;
  }

  async getStatus(signature: string): Promise<"PENDING" | "CONFIRMED" | "FAILED"> {
    return "PENDING";
  }
}

export function createSwapProvider(): SwapProvider {
  return new JupiterSwapProvider();
}
