import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getCurrentUser, ensureDevUser, createSession } from "@/lib/auth/session";
import { developerService } from "@/lib/developers/developer-service";
import { prisma } from "@/lib/db/prisma";

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

    const follows = await developerService.listFollows(user.id);
    return NextResponse.json({
      follows: follows.map((f) => ({
        id: f.id,
        developerAddress: f.developer.address,
        score: f.developer.scores[0]?.score ?? null,
        confidence: f.developer.confidence,
        tradeAmountSol: Number(f.tradeAmountSol),
        minDevScore: f.minDevScore,
        maxPositions: f.maxPositions,
        autoBuy: f.autoBuy,
        alertsEnabled: f.alertsEnabled,
      })),
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed";
    if (message.includes("Prisma") || message.includes("connect")) {
      return NextResponse.json({ follows: [], note: "Database not connected" });
    }
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

const FollowSchema = z.object({
  developerAddress: z.string().min(32).max(64),
  tradeAmountSol: z.number().positive().max(10).optional(),
  minDevScore: z.number().int().min(0).max(100).optional(),
  maxPositions: z.number().int().min(1).max(20).optional(),
  maxDailyExposureSol: z.number().positive().optional(),
  minLiquidityUsd: z.number().positive().optional(),
  cooldownSeconds: z.number().int().min(0).optional(),
  autoBuy: z.boolean().optional(),
  alertsEnabled: z.boolean().optional(),
});

export async function POST(req: NextRequest) {
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

    const body = await req.json();
    const parsed = FollowSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: "Invalid input" }, { status: 400 });
    }

    let dev = await prisma.developer.findUnique({
      where: { address: parsed.data.developerAddress },
    });
    if (!dev) {
      dev = await prisma.developer.create({
        data: {
          address: parsed.data.developerAddress,
          totalLaunches: 0,
          sampleSize: 0,
          confidence: "LOW",
        },
      });
    }

    const follow = await developerService.follow({
      userId: user.id,
      developerId: dev.id,
      ...parsed.data,
    });

    return NextResponse.json({
      follow: {
        id: follow.id,
        developerAddress: parsed.data.developerAddress,
        tradeAmountSol: Number(follow.tradeAmountSol),
        autoBuy: follow.autoBuy,
        minDevScore: follow.minDevScore,
      },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Follow failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
