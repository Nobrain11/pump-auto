#!/usr/bin/env node
/**
 * Web runtime entry — validates DATABASE_URL then applies schema and starts Next.
 */
import { spawnSync } from "node:child_process";

const url = process.env.DATABASE_URL || "";

function fail(msg) {
  console.error("\n[PUMP AUTO] FATAL:", msg);
  console.error(`
Fix on Railway (web service → Variables):

  1. Open your Postgres plugin → Variables
  2. Copy DATABASE_URL (or use reference syntax)
  3. On the WEB service set:

       DATABASE_URL="${{Postgres.DATABASE_URL}}"

     (use your actual Postgres service name)

  Internal URLs look like:
       postgresql://...@postgres.railway.internal:5432/railway

  NEVER use localhost or the values from .env.example in production.
`);
  process.exit(1);
}

if (!url) fail("DATABASE_URL is not set");
if (/localhost|127\.0\.0\.1/.test(url)) {
  fail(
    `DATABASE_URL points to localhost (got host from: ${url.replace(/:[^:@/]+@/, ":***@")}). Railway containers cannot reach localhost Postgres.`
  );
}

console.log("[PUMP AUTO] Applying schema (prisma db push)…");
const push = spawnSync("pnpm", ["exec", "prisma", "db", "push"], {
  stdio: "inherit",
  env: process.env,
  shell: false,
});
if (push.status !== 0) {
  // try npx fallback
  const push2 = spawnSync("npx", ["prisma", "db", "push"], {
    stdio: "inherit",
    env: process.env,
  });
  if (push2.status !== 0) fail("prisma db push failed — check DATABASE_URL and that Postgres is running");
}

console.log("[PUMP AUTO] Starting Next.js…");
process.env.NODE_ENV = "production";
const next = spawnSync("pnpm", ["exec", "next", "start"], {
  stdio: "inherit",
  env: process.env,
});
if (next.status !== 0) {
  const next2 = spawnSync("npx", ["next", "start"], {
    stdio: "inherit",
    env: process.env,
  });
  process.exit(next2.status ?? 1);
}
process.exit(next.status ?? 0);
