#!/usr/bin/env node
/**
 * Bot runtime entry — validates DATABASE_URL, applies schema, runs worker.
 */
import { spawnSync } from "node:child_process";

const url = process.env.DATABASE_URL || "";

function fail(msg) {
  console.error("\n[PUMP AUTO BOT] FATAL:", msg);
  console.error(`
Set on bot service:
  DATABASE_URL=\${{Postgres.DATABASE_URL}}  (same as web, never localhost)
`);
  process.exit(1);
}

if (!url) fail("DATABASE_URL is not set");
if (/localhost|127\.0\.0\.1/.test(url)) {
  fail("DATABASE_URL points to localhost");
}

console.log("[PUMP AUTO BOT] prisma generate…");
spawnSync("pnpm", ["exec", "prisma", "generate"], { stdio: "inherit", env: process.env });

console.log("[PUMP AUTO BOT] prisma db push --accept-data-loss…");
let push = spawnSync(
  "pnpm",
  ["exec", "prisma", "db", "push", "--accept-data-loss"],
  { stdio: "inherit", env: process.env }
);
if (push.status !== 0) {
  push = spawnSync("npx", ["prisma", "db", "push", "--accept-data-loss"], {
    stdio: "inherit",
    env: process.env,
  });
  if (push.status !== 0) fail("prisma db push failed");
}

console.log("[PUMP AUTO BOT] starting worker…");
let bot = spawnSync(
  "pnpm",
  ["exec", "tsx", "--tsconfig", "tsconfig.json", "src/workers/bot.ts"],
  { stdio: "inherit", env: process.env }
);
if (bot.status !== 0) {
  bot = spawnSync(
    "npx",
    ["tsx", "--tsconfig", "tsconfig.json", "src/workers/bot.ts"],
    { stdio: "inherit", env: process.env }
  );
  process.exit(bot.status ?? 1);
}
process.exit(bot.status ?? 0);
