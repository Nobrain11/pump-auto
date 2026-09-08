import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getHunterState, setHunterState } from "@/lib/hunter/state";

export const dynamic = "force-dynamic";

export async function GET() {
  const state = await getHunterState();
  return NextResponse.json(state);
}

const BodySchema = z.object({
  action: z.enum([
    "start",
    "stop",
    "pause",
    "resume",
    "emergency_stop",
    "clear_emergency",
  ]),
});

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const parsed = BodySchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: "Invalid action" }, { status: 400 });
    }

    const current = await getHunterState();
    const { action } = parsed.data;

    switch (action) {
      case "start": {
        if (current.emergencyStop) {
          return NextResponse.json(
            { error: "Emergency stop is active. Clear it before starting." },
            { status: 403 }
          );
        }
        return NextResponse.json(
          await setHunterState({
            state: "SCANNING",
            startedAt: new Date().toISOString(),
          })
        );
      }
      case "stop":
        return NextResponse.json(
          await setHunterState({ state: "OFF", startedAt: null })
        );
      case "pause":
        return NextResponse.json(await setHunterState({ state: "PAUSED" }));
      case "resume": {
        if (current.emergencyStop) {
          return NextResponse.json(
            { error: "Emergency stop is active." },
            { status: 403 }
          );
        }
        return NextResponse.json(await setHunterState({ state: "SCANNING" }));
      }
      case "emergency_stop":
        return NextResponse.json(
          await setHunterState({ state: "RISK_HALTED", emergencyStop: true })
        );
      case "clear_emergency":
        return NextResponse.json(
          await setHunterState({ emergencyStop: false, state: "OFF" })
        );
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : "Hunter control failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
