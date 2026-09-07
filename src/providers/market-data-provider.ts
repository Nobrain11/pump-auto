/**
 * MarketDataProvider abstraction.
 * Production must fail visibly when data is unavailable — never invent prices.
 */

export interface TokenMarketSnapshot {
  mint: string;
  symbol?: string;
  name?: string;
  priceUsd: number | null;
  liquidityUsd: number | null;
  volume24hUsd: number | null;
  marketCapUsd: number | null;
  priceChange5m: number | null;
  priceChange1h: number | null;
  priceChange24h: number | null;
  fdvUsd?: number | null;
  pairAddress?: string;
  dexId?: string;
  updatedAt: string;
}

export interface MarketDataProvider {
  getTokenSnapshot(mint: string): Promise<TokenMarketSnapshot | null>;
  getTokenSnapshots(mints: string[]): Promise<TokenMarketSnapshot[]>;
  searchPairs?(query: string): Promise<TokenMarketSnapshot[]>;
}

export class DexScreenerProvider implements MarketDataProvider {
  private baseUrl: string;

  constructor(baseUrl?: string) {
    this.baseUrl =
      baseUrl ||
      process.env.DEXSCREENER_API_URL ||
      "https://api.dexscreener.com/latest/dex";
  }

  async getTokenSnapshot(mint: string): Promise<TokenMarketSnapshot | null> {
    const res = await fetch(`${this.baseUrl}/tokens/${mint}`, {
      headers: { Accept: "application/json" },
      next: { revalidate: 0 },
    });

    if (!res.ok) {
      if (res.status === 404) return null;
      throw new Error(`DexScreener error ${res.status}`);
    }

    const data = await res.json();
    const pairs = data.pairs as Array<Record<string, unknown>> | undefined;
    if (!pairs || pairs.length === 0) return null;

    const pair = pairs.sort(
      (a, b) =>
        (Number((b.liquidity as any)?.["usd"] ?? 0) || 0) -
        (Number((a.liquidity as any)?.["usd"] ?? 0) || 0)
    )[0];

    return this.mapPair(pair, mint);
  }

  async getTokenSnapshots(mints: string[]): Promise<TokenMarketSnapshot[]> {
    const chunk = mints.slice(0, 30).join(",");
    if (!chunk) return [];

    const res = await fetch(`${this.baseUrl}/tokens/${chunk}`, {
      headers: { Accept: "application/json" },
      next: { revalidate: 0 },
    });

    if (!res.ok) {
      throw new Error(`DexScreener batch error ${res.status}`);
    }

    const data = await res.json();
    const pairs = (data.pairs || []) as Array<Record<string, unknown>>;
    const byMint = new Map<string, TokenMarketSnapshot>();

    for (const pair of pairs) {
      const base = pair.baseToken as { address?: string } | undefined;
      const mint = base?.address;
      if (!mint) continue;
      const existing = byMint.get(mint);
      const mapped = this.mapPair(pair, mint);
      if (!existing || (mapped.liquidityUsd ?? 0) > (existing.liquidityUsd ?? 0)) {
        byMint.set(mint, mapped);
      }
    }

    return Array.from(byMint.values());
  }

  private mapPair(
    pair: Record<string, unknown>,
    mint: string
  ): TokenMarketSnapshot {
    const base = pair.baseToken as { symbol?: string; name?: string } | undefined;
    const liq = pair.liquidity as { usd?: number } | undefined;
    const vol = pair.volume as { h24?: number } | undefined;
    const change = pair.priceChange as {
      m5?: number;
      h1?: number;
      h24?: number;
    } | undefined;

    return {
      mint,
      symbol: base?.symbol,
      name: base?.name,
      priceUsd: pair.priceUsd != null ? Number(pair.priceUsd) : null,
      liquidityUsd: liq?.usd != null ? Number(liq.usd) : null,
      volume24hUsd: vol?.h24 != null ? Number(vol.h24) : null,
      marketCapUsd:
        pair.marketCap != null
          ? Number(pair.marketCap)
          : pair.fdv != null
            ? Number(pair.fdv)
            : null,
      priceChange5m: change?.m5 != null ? Number(change.m5) / 100 : null,
      priceChange1h: change?.h1 != null ? Number(change.h1) / 100 : null,
      priceChange24h: change?.h24 != null ? Number(change.h24) / 100 : null,
      fdvUsd: pair.fdv != null ? Number(pair.fdv) : null,
      pairAddress: pair.pairAddress as string | undefined,
      dexId: pair.dexId as string | undefined,
      updatedAt: new Date().toISOString(),
    };
  }
}

export function createMarketDataProvider(): MarketDataProvider {
  return new DexScreenerProvider();
}
