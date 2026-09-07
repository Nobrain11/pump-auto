import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

export async function GET() {
  const checks: Record<string, "ok" | "missing" | "error"> = {
    app: "ok",
    database: "missing",
    redis: "missing",
    solanaRpc: "missing",
    encryptionKey: process.env.WALLET_ENCRYPTION_KEY ? "ok" : "missing",
    authSecret: process.env.AUTH_SECRET || process.env.NEXTAUTH_SECRET ? "ok" : "missing",
  };

  try {
    if (process.env.DATABASE_URL) {
      const { prisma } = await import("@/lib/db/prisma");
      await prisma.$queryRaw`SELECT 1`;
      checks.database = "ok";
    }
  } catch {
    checks.database = "error";
  }

  try {
    if (process.env.REDIS_URL) {
      const Redis = (await import("ioredis")).default;
      const redis = new Redis(process.env.REDIS_URL, { maxRetriesPerRequest: 1, lazyConnect: true });
      await redis.connect();
      await redis.ping();
      await redis.quit();
      checks.redis = "ok";
    }
  } catch {
    checks.redis = "error";
  }

  try {
    if (process.env.SOLANA_RPC_URL) {
      const res = await fetch(process.env.SOLANA_RPC_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          jsonrpc: "2.0",
          id: 1,
          method: "getHealth",
        }),
      });
      if (res.ok) checks.solanaRpc = "ok";
      else checks.solanaRpc = "error";
    }
  } catch {
    checks.solanaRpc = "error";
  }

  const healthy =
    checks.app === "ok" &&
    checks.encryptionKey === "ok" &&
    checks.authSecret === "ok";

  return NextResponse.json(
    {
      status: healthy ? "ready" : "degraded",
      checks,
      timestamp: new Date().toISOString(),
    },
    { status: healthy ? 200 : 503 }
  );
}
