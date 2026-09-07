/**
 * Redis client — queues, locks, rate limits, live hunter state, idempotency.
 * Not the source of financial truth (Postgres is).
 */

import Redis from "ioredis";

let client: Redis | null = null;

export function getRedis(): Redis {
  if (client) return client;
  const url = process.env.REDIS_URL;
  if (!url) throw new Error("REDIS_URL is not configured");
  client = new Redis(url, {
    maxRetriesPerRequest: 2,
    enableReadyCheck: true,
    lazyConnect: true,
    connectTimeout: 1500,
    commandTimeout: 2000,
  });
  return client;
}

async function withRedis<T>(operation: (redis: Redis) => Promise<T>): Promise<T | null> {
  try {
    const redis = getRedis();
    if (redis.status !== "ready") await redis.connect();
    return await operation(redis);
  } catch {
    return null;
  }
}

export async function publishEvent(type: string, payload: Record<string, unknown>): Promise<boolean> {
  const result = await withRedis((redis) => redis.publish(`events:${type}`, JSON.stringify(payload)));
  return result !== null;
}

export async function enqueue(queue: string, payload: Record<string, unknown>): Promise<boolean> {
  const result = await withRedis((redis) => redis.lpush(`queue:${queue}`, JSON.stringify(payload)));
  return result !== null;
}

export async function consume(queue: string, timeoutSeconds = 1): Promise<Record<string, unknown> | null> {
  const result = await withRedis((redis) => redis.brpop(`queue:${queue}`, timeoutSeconds));
  if (!result) return null;
  try {
    return JSON.parse(result[1]) as Record<string, unknown>;
  } catch {
    return null;
  }
}

export async function acquireLock(
  key: string,
  ttlSeconds: number,
  token = `${Date.now()}`
): Promise<boolean> {
  const result = await withRedis((redis) => redis.set(`lock:${key}`, token, "EX", ttlSeconds, "NX"));
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
  const result = await withRedis((redis) => redis.set(`idem:${key}`, "1", "EX", ttlSeconds, "NX"));
  // Redis is an optimization for deduplication. Without it, preserve the request path.
  return result === null || result === "OK";
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
