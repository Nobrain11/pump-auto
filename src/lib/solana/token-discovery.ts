/**
 * Token Discovery
 * Detects new / interesting tokens for the scanner pipeline.
 */

import { createMarketDataProvider } from "@/providers/market-data-provider";
import type { TokenMarketSnapshot } from "@/providers/market-data-provider";

export interface DiscoveredToken {
  mint: string;
  symbol?: string;
  name?: string;
  creatorAddress?: string;
  source: "pump" | "dexscreener" | "helius" | "manual";
  discoveredAt: string;
  market?: TokenMarketSnapshot | null;
}

export interface TokenDiscoveryProvider {
  getRecentTokens(limit?: number): Promise<DiscoveredToken[]>;
}

export class DexScreenerDiscovery implements TokenDiscoveryProvider {
  async getRecentTokens(limit = 30): Promise<DiscoveredToken[]> {
    const res = await fetch(
      "https://api.dexscreener.com/token-boosts/top/v1",
      { headers: { Accept: "application/json" }, next: { revalidate: 0 } }
    );

    if (!res.ok) {
      throw new Error(`Token discovery failed: ${res.status}`);
    }

    const items = (await res.json()) as Array<{
      tokenAddress?: string;
      chainId?: string;
      description?: string;
    }>;

    const solana = items
      .filter((i) => i.chainId === "solana" && i.tokenAddress)
      .slice(0, limit);

    const mints = solana.map((i) => i.tokenAddress!);
    const marketProvider = createMarketDataProvider();
    let snapshots: TokenMarketSnapshot[] = [];
    try {
      snapshots = await marketProvider.getTokenSnapshots(mints);
    } catch {
      // market data optional at discovery time
    }
    const byMint = new Map(snapshots.map((s) => [s.mint, s]));

    return solana.map((item) => ({
      mint: item.tokenAddress!,
      source: "dexscreener" as const,
      discoveredAt: new Date().toISOString(),
      market: byMint.get(item.tokenAddress!) || null,
      symbol: byMint.get(item.tokenAddress!)?.symbol,
      name: byMint.get(item.tokenAddress!)?.name,
    }));
  }
}

export function createTokenDiscovery(): TokenDiscoveryProvider {
  return new DexScreenerDiscovery();
}
