#!/usr/bin/env node
/**
 * Web runtime entry — validates DATABASE_URL then applies schema and starts Next.
 */
import { spawnSync } from "node:child_process";

const url = process.env.DATABASE_URL || "";

function redact(u) {
  try {
    const x = new URL(u);
    return `${x.protocol}//${x.username ? "***@" : ""}${x.hostname}:${x.port || "5432"}${x.pathname}`;
  } catch {
    return u ? "(unparseable DATABASE_URL)" : "(empty)";
  }
}

function fail(msg) {
  console.error("\n[PUMP AUTO] FATAL:", msg);
  console.error("[PUMP AUTO] DATABASE_URL seen by process:", redact(url));
  console.error(`
Railway fix (web service):
  1. Variables → delete ANY DATABASE_URL that contains localhost
  2. Add shared variable from Postgres:
       Click "Add variable" → "Add reference" → Postgres → DATABASE_URL
  3. Or paste the *internal* URL from Postgres → Connect → private network
  4. Redeploy (variable changes need a new deploy)

Correct host looks like:  postgres.railway.internal
Wrong hosts:             localhost  127.0.0.1  pump_auto on local
`);
  process.exit(1);
}

console.log("[PUMP AUTO] DATABASE_URL:", redact(url));

if (!url) fail("DATABASE_URL is not set on this service");
if (/localhost|127\.0\.0\.1/.test(url)) {
  fail("DATABASE_URL still points to localhost — Railway variable is wrong or not applied");
}

console.log("[PUMP AUTO] Applying schema (prisma db push --accept-data-loss)…");
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
