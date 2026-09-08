/**
 * Token Discovery — Pump.fun movers first, DexScreener enrich/fallback.
 */

import { createMarketDataProvider } from "@/providers/market-data-provider";
import type { TokenMarketSnapshot } from "@/providers/market-data-provider";

export interface DiscoveredToken {
  mint: string;
  symbol?: string;
  name?: string;
  imageUrl?: string;
  creatorAddress?: string;
  source: "pump" | "dexscreener" | "helius" | "manual";
  discoveredAt: string;
  market?: TokenMarketSnapshot | null;
  marketCapUsd?: number | null;
  volume24hUsd?: number | null;
  liquidityUsd?: number | null;
  priceUsd?: number | null;
  createdAt?: string | null;
}

export interface TokenDiscoveryProvider {
  getRecentTokens(limit?: number): Promise<DiscoveredToken[]>;
}

async function fetchJson(url: string): Promise<unknown> {
  const res = await fetch(url, {
    headers: { Accept: "application/json", "User-Agent": "PUMP-AUTO/1.0" },
    cache: "no-store",
  });
  if (!res.ok) throw new Error(`${url} → ${res.status}`);
  return res.json();
}

type PumpCoin = {
  mint?: string;
  address?: string;
  symbol?: string;
  name?: string;
  image_uri?: string;
  imageUri?: string;
  usd_market_cap?: number;
  market_cap?: number;
  volume_24h?: number;
  volume24h?: number;
  virtual_sol_reserves?: number;
  creator?: string;
  created_timestamp?: number;
  price?: number;
  usd_price?: number;
};

function mapPumpCoin(c: PumpCoin): DiscoveredToken | null {
  const mint = c.mint || c.address;
  if (!mint || mint.length < 32) return null;
  const mc = c.usd_market_cap ?? c.market_cap ?? null;
  const solRes = c.virtual_sol_reserves;
  const liq = solRes != null && solRes > 0 ? solRes * 2 * 150 : null;
  const vol = c.volume_24h ?? c.volume24h ?? null;
  const price = c.usd_price ?? c.price ?? null;
  return {
    mint,
    symbol: c.symbol,
    name: c.name,
    imageUrl: c.image_uri || c.imageUri,
    creatorAddress: c.creator,
    source: "pump",
    discoveredAt: new Date().toISOString(),
    marketCapUsd: typeof mc === "number" ? mc : null,
    volume24hUsd: typeof vol === "number" ? vol : null,
    liquidityUsd: typeof liq === "number" ? liq : null,
    priceUsd: typeof price === "number" ? price : null,
    createdAt:
      c.created_timestamp != null
        ? new Date(c.created_timestamp).toISOString()
        : null,
  };
}

async function fetchPumpMovers(limit: number): Promise<DiscoveredToken[]> {
  const endpoints = [
    `https://frontend-api.pump.fun/coins?offset=0&limit=${limit}&sort=last_trade_timestamp&order=DESC&includeNsfw=false`,
    `https://frontend-api.pump.fun/coins?offset=0&limit=${limit}&sort=created_timestamp&order=DESC&includeNsfw=false`,
    `https://frontend-api.pump.fun/coins/king-of-the-hill?includeNsfw=false`,
  ];
  const byMint = new Map<string, DiscoveredToken>();
  for (const url of endpoints) {
    try {
      const raw = await fetchJson(url);
      const list = Array.isArray(raw)
        ? raw
        : Array.isArray((raw as { coins?: unknown }).coins)
          ? (raw as { coins: PumpCoin[] }).coins
          : raw && typeof raw === "object" && "mint" in (raw as object)
            ? [raw as PumpCoin]
            : [];
      for (const c of list as PumpCoin[]) {
        const mapped = mapPumpCoin(c);
        if (mapped && !byMint.has(mapped.mint)) byMint.set(mapped.mint, mapped);
      }
    } catch (err) {
      console.warn("[discovery] pump failed:", url, err instanceof Error ? err.message : err);
    }
  }
  return [...byMint.values()].slice(0, limit);
}

async function enrichWithDex(tokens: DiscoveredToken[]): Promise<DiscoveredToken[]> {
  if (!tokens.length) return tokens;
  try {
    const marketProvider = createMarketDataProvider();
    const snapshots = await marketProvider.getTokenSnapshots(tokens.map((t) => t.mint));
    const byMint = new Map(snapshots.map((s) => [s.mint, s]));
    return tokens.map((t) => {
      const s = byMint.get(t.mint);
      if (!s) {
        return {
          ...t,
          market: {
            mint: t.mint,
            symbol: t.symbol,
            name: t.name,
            priceUsd: t.priceUsd ?? null,
            liquidityUsd: t.liquidityUsd ?? null,
            volume24hUsd: t.volume24hUsd ?? null,
            marketCapUsd: t.marketCapUsd ?? null,
            priceChange5m: null,
            priceChange1h: null,
            priceChange24h: null,
            updatedAt: new Date().toISOString(),
          },
        };
      }
      return {
        ...t,
        symbol: t.symbol || s.symbol,
        name: t.name || s.name,
        marketCapUsd: s.marketCapUsd ?? t.marketCapUsd ?? null,
        volume24hUsd: s.volume24hUsd ?? t.volume24hUsd ?? null,
        liquidityUsd: s.liquidityUsd ?? t.liquidityUsd ?? null,
        priceUsd: s.priceUsd ?? t.priceUsd ?? null,
        market: s,
      };
    });
  } catch {
    return tokens.map((t) => ({
      ...t,
      market: {
        mint: t.mint,
        symbol: t.symbol,
        name: t.name,
        priceUsd: t.priceUsd ?? null,
        liquidityUsd: t.liquidityUsd ?? null,
        volume24hUsd: t.volume24hUsd ?? null,
        marketCapUsd: t.marketCapUsd ?? null,
        priceChange5m: null,
        priceChange1h: null,
        priceChange24h: null,
        updatedAt: new Date().toISOString(),
      },
    }));
  }
}

async function dexFallback(limit: number): Promise<DiscoveredToken[]> {
  try {
    const data = (await fetchJson(
      "https://api.dexscreener.com/latest/dex/search?q=pump"
    )) as { pairs?: Array<Record<string, unknown>> };
    const out: DiscoveredToken[] = [];
    for (const pair of data.pairs || []) {
      if (pair.chainId !== "solana") continue;
      const base = pair.baseToken as { address?: string; symbol?: string; name?: string } | undefined;
      if (!base?.address) continue;
      const liq = pair.liquidity as { usd?: number } | undefined;
      const vol = pair.volume as { h24?: number } | undefined;
      out.push({
        mint: base.address,
        symbol: base.symbol,
        name: base.name,
        imageUrl: (pair.info as { imageUrl?: string } | undefined)?.imageUrl,
        source: "dexscreener",
        discoveredAt: new Date().toISOString(),
        liquidityUsd: liq?.usd ?? null,
        volume24hUsd: vol?.h24 ?? null,
        marketCapUsd: (pair.marketCap as number) ?? null,
        priceUsd: pair.priceUsd ? Number(pair.priceUsd) : null,
      });
      if (out.length >= limit) break;
    }
    return out;
  } catch {
    return [];
  }
}

export class PumpFunDiscovery implements TokenDiscoveryProvider {
  async getRecentTokens(limit = 30): Promise<DiscoveredToken[]> {
    let tokens = await fetchPumpMovers(Math.max(limit, 20));
    if (tokens.length === 0) {
      console.warn("[discovery] pump empty — dex fallback");
      tokens = await dexFallback(limit);
    }
    return enrichWithDex(tokens.slice(0, limit));
  }
}

export function createTokenDiscovery(): TokenDiscoveryProvider {
  return new PumpFunDiscovery();
}
