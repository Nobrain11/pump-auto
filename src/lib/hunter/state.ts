/**
 * Shared hunter state across web (API) and bot (worker).
 * Prefer Redis so both Railway services see the same START/STOP.
 */

import { getRedis } from "@/lib/redis";

export type HunterStateName =
  | "OFF"
  | "STARTING"
  | "SCANNING"
  | "ANALYZING"
  | "READY"
  | "EXECUTING"
  | "MONITORING"
  | "PAUSED"
  | "RISK_HALTED"
  | "ERROR";

export interface HunterLiveState {
  state: HunterStateName;
  startedAt: string | null;
  opportunitiesFound: number;
  passedFilters: number;
  positions: number;
  entriesToday: number;
  dailyRiskUsedPct: number;
  marketRegime: string;
  emergencyStop: boolean;
  lastScanAt?: string | null;
  lastEntryMint?: string | null;
  note?: string;
}

const KEY = "hunter:control:v1";
const DEFAULT: HunterLiveState = {
  state: "OFF",
  startedAt: null,
  opportunitiesFound: 0,
  passedFilters: 0,
  positions: 0,
  entriesToday: 0,
  dailyRiskUsedPct: 0,
  marketRegime: "UNKNOWN",
  emergencyStop: false,
  lastScanAt: null,
  lastEntryMint: null,
};

let memory: HunterLiveState = { ...DEFAULT };

async function redisGet(): Promise<HunterLiveState | null> {
  try {
    if (!process.env.REDIS_URL) return null;
    const redis = getRedis();
    if (redis.status !== "ready") await redis.connect();
    const raw = await redis.get(KEY);
    if (!raw) return null;
    return { ...DEFAULT, ...JSON.parse(raw) } as HunterLiveState;
  } catch {
    return null;
  }
}

async function redisSet(state: HunterLiveState): Promise<void> {
  try {
    if (!process.env.REDIS_URL) return;
    const redis = getRedis();
    if (redis.status !== "ready") await redis.connect();
    await redis.set(KEY, JSON.stringify(state));
  } catch {
    /* memory still holds */
  }
}

export async function getHunterState(): Promise<HunterLiveState> {
  const fromRedis = await redisGet();
  if (fromRedis) {
    memory = fromRedis;
    return fromRedis;
  }
  return { ...memory };
}

export async function setHunterState(
  patch: Partial<HunterLiveState>
): Promise<HunterLiveState> {
  const current = await getHunterState();
  const next: HunterLiveState = { ...current, ...patch };
  memory = next;
  await redisSet(next);
  return next;
}

export function isHunterActive(state: HunterLiveState): boolean {
  if (state.emergencyStop) return false;
  return ["SCANNING", "ANALYZING", "READY", "EXECUTING", "MONITORING"].includes(
    state.state
  );
}
