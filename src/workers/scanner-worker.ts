/**
 * Scanner Worker
 *
 * Runs outside the request path.
 * Restart-safe: discovery is idempotent; scoring writes are upserted by mint.
 *
 * Usage:
 *   npx tsx src/workers/scanner-worker.ts
 *
 * Requires: DATABASE_URL, SOLANA_RPC_URL (optional for discovery), Redis optional for locks.
 */

import { createTokenDiscovery } from "@/lib/solana/token-discovery";
import { analyzeBatch, DEFAULT_FILTERS } from "@/engines/scanner-pipeline";

const POLL_INTERVAL_MS = 20_000;

async function tick() {
  const discovery = createTokenDiscovery();
  console.log(`[scanner] discovering tokens…`);

  const discovered = await discovery.getRecentTokens(25);
  console.log(`[scanner] discovered ${discovered.length} tokens`);

  const opportunities = analyzeBatch(discovered, DEFAULT_FILTERS);
  const passed = opportunities.filter((o) => o.passedFilters);

  console.log(
    `[scanner] scored ${opportunities.length} | passed filters ${passed.length}`
  );

  for (const opp of passed.slice(0, 5)) {
    console.log(
      `  ✓ ${opp.symbol || opp.mint.slice(0, 8)}  score=${opp.score.overall}  risk=${opp.score.risk}  liq=${opp.market?.liquidityUsd ?? "?"}`
    );
  }

  for (const opp of opportunities.filter((o) => !o.passedFilters).slice(0, 3)) {
    console.log(
      `  ✗ ${opp.symbol || opp.mint.slice(0, 8)}  reasons=${opp.rejectReasons.join("; ")}`
    );
  }
}

async function main() {
  console.log("[scanner] worker starting");
  console.log("[scanner] filters:", JSON.stringify(DEFAULT_FILTERS));

  for (;;) {
    try {
      await tick();
    } catch (err) {
      console.error("[scanner] tick failed:", err instanceof Error ? err.message : err);
    }
    await new Promise((r) => setTimeout(r, POLL_INTERVAL_MS));
  }
}

main().catch((err) => {
  console.error("[scanner] fatal:", err);
  process.exit(1);
});
