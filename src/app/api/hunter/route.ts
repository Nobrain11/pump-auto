import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getCurrentUser, ensureDevUser, createSession } from "@/lib/auth/session";

export const dynamic = "force-dynamic";

let localState: {
  state: string;
  startedAt: string | null;
  opportunitiesFound: number;
  passedFilters: number;
  positions: number;
  entriesToday: number;
  dailyRiskUsedPct: number;
  marketRegime: string;
  emergencyStop: boolean;
} = {
  state: "OFF",
  startedAt: null,
  opportunitiesFound: 0,
  passedFilters: 0,
  positions: 0,
  entriesToday: 0,
  dailyRiskUsedPct: 0,
  marketRegime: "UNKNOWN",
  emergencyStop: false,
};

export async function GET() {
  return NextResponse.json({
    ...localState,
    note: "Wire to HunterSession table + Redis live state in production worker.",
  });
}

const BodySchema = z.object({
  action: z.enum(["start", "stop", "pause", "resume", "emergency_stop", "clear_emergency"]),
});

export async function POST(req: NextRequest) {
  try {
    let user = await getCurrentUser();
    if (!user && process.env.NODE_ENV === "development") {
      const userId = await ensureDevUser();
      await createSession(userId);
      user = await getCurrentUser();
    }
    const body = await req.json();
    const parsed = BodySchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: "Invalid action" }, { status: 400 });
    }

    const { action } = parsed.data;

    switch (action) {
      case "start":
        if (localState.emergencyStop) {
          return NextResponse.json(
            { error: "Emergency stop is active. Clear it before starting." },
            { status: 403 }
          );
        }
        localState = {
          ...localState,
          state: "SCANNING",
          startedAt: new Date().toISOString(),
        };
        break;
      case "stop":
        localState = { ...localState, state: "OFF", startedAt: null };
        break;
      case "pause":
        localState = { ...localState, state: "PAUSED" };
        break;
      case "resume":
        if (localState.emergencyStop) {
          return NextResponse.json({ error: "Emergency stop is active." }, { status: 403 });
        }
        localState = { ...localState, state: "SCANNING" };
        break;
      case "emergency_stop":
        localState = { ...localState, state: "RISK_HALTED", emergencyStop: true };
        break;
      case "clear_emergency":
        localState = { ...localState, emergencyStop: false, state: "OFF" };
        break;
    }

    return NextResponse.json(localState);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Hunter control failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
