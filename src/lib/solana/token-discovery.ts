/**
 * Token Discovery — pluggable sources.
 * Prefer rotating endpoints so the scanner is not stuck on one static list.
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

async function fetchJson(url: string): Promise<unknown> {
  const res = await fetch(url, {
    headers: { Accept: "application/json" },
    cache: "no-store",
  });
  if (!res.ok) throw new Error(`${url} → ${res.status}`);
  return res.json();
}

async function collectSolanaMints(limit: number): Promise<string[]> {
  const mints = new Set<string>();

  const add = (addr?: string, chain?: string) => {
    if (!addr) return;
    if (chain && chain !== "solana") return;
    if (addr.length >= 32 && addr.length <= 48) mints.add(addr);
  };

  try {
    const profiles = (await fetchJson(
      "https://api.dexscreener.com/token-profiles/latest/v1"
    )) as Array<{ tokenAddress?: string; chainId?: string }>;
    for (const p of profiles || []) add(p.tokenAddress, p.chainId);
  } catch {
    /* continue */
  }

  try {
    const boosts = (await fetchJson(
      "https://api.dexscreener.com/token-boosts/latest/v1"
    )) as Array<{ tokenAddress?: string; chainId?: string }>;
    for (const p of boosts || []) add(p.tokenAddress, p.chainId);
  } catch {
    /* continue */
  }

  try {
    const top = (await fetchJson(
      "https://api.dexscreener.com/token-boosts/top/v1"
    )) as Array<{ tokenAddress?: string; chainId?: string }>;
    for (const p of top || []) add(p.tokenAddress, p.chainId);
  } catch {
    /* continue */
  }

  const queries = ["SOL", "pump", "raydium", "bonk"];
  const q = queries[Math.floor(Date.now() / 60_000) % queries.length];
  try {
    const data = (await fetchJson(
      `https://api.dexscreener.com/latest/dex/search?q=${encodeURIComponent(q)}`
    )) as { pairs?: Array<Record<string, unknown>> };
    for (const pair of data.pairs || []) {
      if (pair.chainId !== "solana") continue;
      const base = pair.baseToken as { address?: string } | undefined;
      add(base?.address, "solana");
    }
  } catch {
    /* continue */
  }

  return [...mints].slice(0, limit);
}

export class DexScreenerDiscovery implements TokenDiscoveryProvider {
  async getRecentTokens(limit = 30): Promise<DiscoveredToken[]> {
    const mints = await collectSolanaMints(Math.max(limit, 25));
    if (mints.length === 0) {
      throw new Error("Token discovery returned 0 Solana mints from all sources");
    }

    const marketProvider = createMarketDataProvider();
    let snapshots: TokenMarketSnapshot[] = [];
    try {
      snapshots = await marketProvider.getTokenSnapshots(mints);
    } catch (err) {
      console.warn(
        "[discovery] market enrich failed:",
        err instanceof Error ? err.message : err
      );
    }
    const byMint = new Map(snapshots.map((s) => [s.mint, s]));

    const now = new Date().toISOString();
    return mints.map((mint) => {
      const market = byMint.get(mint) || null;
      return {
        mint,
        source: "dexscreener" as const,
        discoveredAt: now,
        market,
        symbol: market?.symbol,
        name: market?.name,
      };
    });
  }
}

export function createTokenDiscovery(): TokenDiscoveryProvider {
  return new DexScreenerDiscovery();
}
