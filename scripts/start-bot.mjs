#!/usr/bin/env node
/**
 * Bot runtime entry — validates DATABASE_URL, applies schema, runs worker.
 */
import { spawnSync } from "node:child_process";

const url = process.env.DATABASE_URL || "";

function fail(msg) {
  console.error("\n[PUMP AUTO BOT] FATAL:", msg);
  console.error(`
Fix on Railway (bot service → Variables):

  DATABASE_URL must be the SAME Postgres as the web service.
  Use variable reference:

    DATABASE_URL="${{Postgres.DATABASE_URL}}"

  Must NOT be localhost. Must NOT be the .env.example value.
`);
  process.exit(1);
}

if (!url) fail("DATABASE_URL is not set");
if (/localhost|127\.0\.0\.1/.test(url)) {
  fail("DATABASE_URL points to localhost — set Railway Postgres URL on the bot service");
}

console.log("[PUMP AUTO BOT] prisma generate…");
spawnSync("pnpm", ["exec", "prisma", "generate"], { stdio: "inherit", env: process.env });

console.log("[PUMP AUTO BOT] prisma db push…");
const push = spawnSync("pnpm", ["exec", "prisma", "db", "push"], {
  stdio: "inherit",
  env: process.env,
});
if (push.status !== 0) {
  const push2 = spawnSync("npx", ["prisma", "db", "push"], { stdio: "inherit", env: process.env });
  if (push2.status !== 0) fail("prisma db push failed");
}

console.log("[PUMP AUTO BOT] starting worker…");
const bot = spawnSync(
  "pnpm",
  ["exec", "tsx", "--tsconfig", "tsconfig.json", "src/workers/bot.ts"],
  { stdio: "inherit", env: process.env }
);
if (bot.status !== 0) {
  const bot2 = spawnSync(
    "npx",
    ["tsx", "--tsconfig", "tsconfig.json", "src/workers/bot.ts"],
    { stdio: "inherit", env: process.env }
  );
  process.exit(bot2.status ?? 1);
}
process.exit(bot.status ?? 0);
