/**
 * Redis client — queues, locks, rate limits, live hunter state, idempotency.
 * Not the source of financial truth (Postgres is).
 */

import Redis from "ioredis";

let client: Redis | null = null;

export function getRedis(): Redis {
  if (client) return client;
  const url = process.env.REDIS_URL;
  if (!url) {
    throw new Error("REDIS_URL is required for locks/queues");
  }
  client = new Redis(url, {
    maxRetriesPerRequest: 2,
    enableReadyCheck: true,
    lazyConnect: true,
  });
  return client;
}

export async function acquireLock(
  key: string,
  ttlSeconds: number,
  token = `${Date.now()}`
): Promise<boolean> {
  const redis = getRedis();
  if (redis.status !== "ready") await redis.connect();
  const result = await redis.set(`lock:${key}`, token, "EX", ttlSeconds, "NX");
  return result === "OK";
}

export async function releaseLock(key: string, token: string): Promise<void> {
  const redis = getRedis();
  const script = `
    if redis.call("get", KEYS[1]) == ARGV[1] then
      return redis.call("del", KEYS[1])
    else
      return 0
    end
  `;
  await redis.eval(script, 1, `lock:${key}`, token);
}

export async function once(key: string, ttlSeconds = 86400): Promise<boolean> {
  const redis = getRedis();
  if (redis.status !== "ready") await redis.connect();
  const result = await redis.set(`idem:${key}`, "1", "EX", ttlSeconds, "NX");
  return result === "OK";
}

export async function setHunterLive(
  userId: string,
  state: Record<string, unknown>
): Promise<void> {
  try {
    const redis = getRedis();
    if (redis.status !== "ready") await redis.connect();
    await redis.set(
      `hunter:live:${userId}`,
      JSON.stringify(state),
      "EX",
      120
    );
  } catch {
    // Redis optional for read path
  }
}

export async function getHunterLive(
  userId: string
): Promise<Record<string, unknown> | null> {
  try {
    const redis = getRedis();
    if (redis.status !== "ready") await redis.connect();
    const raw = await redis.get(`hunter:live:${userId}`);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}
