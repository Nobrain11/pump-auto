#!/usr/bin/env node
/**
 * Web runtime entry — validates DATABASE_URL then applies schema and starts Next.
 */
import { spawnSync } from "node:child_process";

const url = process.env.DATABASE_URL || "";

function fail(msg) {
  console.error("\n[PUMP AUTO] FATAL:", msg);
  console.error(`
Fix DATABASE_URL on Railway (web service → Variables):
  DATABASE_URL=\${{Postgres.DATABASE_URL}}
  Must be postgres.railway.internal — never localhost.
`);
  process.exit(1);
}

if (!url) fail("DATABASE_URL is not set");
if (/localhost|127\.0\.0\.1/.test(url)) {
  fail(
    `DATABASE_URL points to localhost. Set Railway Postgres URL (postgres.railway.internal).`
  );
}

console.log("[PUMP AUTO] Applying schema (prisma db push --accept-data-loss)…");
console.log(
  "[PUMP AUTO] Note: if this DB is shared with another app, prefer a dedicated Postgres service."
);

const pushArgs = ["exec", "prisma", "db", "push", "--accept-data-loss"];
let push = spawnSync("pnpm", pushArgs, { stdio: "inherit", env: process.env });
if (push.status !== 0) {
  push = spawnSync("npx", ["prisma", "db", "push", "--accept-data-loss"], {
    stdio: "inherit",
    env: process.env,
  });
  if (push.status !== 0) fail("prisma db push failed");
}

console.log("[PUMP AUTO] Starting Next.js…");
process.env.NODE_ENV = "production";
let next = spawnSync("pnpm", ["exec", "next", "start"], {
  stdio: "inherit",
  env: process.env,
});
if (next.status !== 0) {
  next = spawnSync("npx", ["next", "start"], { stdio: "inherit", env: process.env });
  process.exit(next.status ?? 1);
}
process.exit(next.status ?? 0);
