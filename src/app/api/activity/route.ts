import { NextResponse } from "next/server";
import { getCurrentUser, ensureDevUser, createSession } from "@/lib/auth/session";
import { listActivity } from "@/lib/activity";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    let user = await getCurrentUser();
    if (!user && process.env.NODE_ENV === "development") {
      const userId = await ensureDevUser();
      await createSession(userId);
      user = await getCurrentUser();
    }
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const events = await listActivity(user.id, 50);
    return NextResponse.json({
      events: events.map((e) => ({
        id: e.id,
        type: e.type,
        message: e.message,
        severity: e.severity,
        timestamp: e.createdAt,
        metadata: e.metadata,
      })),
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Activity failed";
    if (message.includes("Prisma") || message.includes("connect") || message.includes("DATABASE")) {
      return NextResponse.json({
        events: [],
        note: "Database not connected.",
      });
    }
    return NextResponse.json({ error: "Failed to load activity" }, { status: 500 });
  }
}
