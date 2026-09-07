import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { developerService } from "@/lib/developers/developer-service";
import { computeDeveloperScore } from "@/engines/developer-scoring";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const address = req.nextUrl.searchParams.get("address");
  if (!address || address.length < 32) {
    return NextResponse.json(
      { error: "Query param address required" },
      { status: 400 }
    );
  }

  try {
    const dev = await developerService.getByAddress(address);
    if (!dev) {
      return NextResponse.json({
        found: false,
        address,
        note: "No indexed history yet. Developer stats are built from verified launches only.",
      });
    }

    const latestScore = dev.scores[0];
    return NextResponse.json({
      found: true,
      developer: {
        address: dev.address,
        totalLaunches: dev.totalLaunches,
        graduatedCount: dev.graduatedCount,
        abandonedCount: dev.abandonedCount,
        activeCount: dev.activeCount,
        medianSurvivalSeconds: dev.medianSurvivalSeconds,
        medianPeakMultiple: dev.medianPeakMultiple
          ? Number(dev.medianPeakMultiple)
          : null,
        successfulLaunchRatio: dev.successfulLaunchRatio
          ? Number(dev.successfulLaunchRatio)
          : null,
        sampleSize: dev.sampleSize,
        confidence: dev.confidence,
        score: latestScore?.score ?? null,
        riskIndicators: dev.riskIndicators,
        recentLaunches: dev.launches.map((l) => ({
          mint: l.mint,
          launchedAt: l.launchedAt,
          outcome: l.outcome,
          peakMultiple: l.peakMultiple ? Number(l.peakMultiple) : null,
        })),
      },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Lookup failed";
    if (message.includes("Prisma") || message.includes("connect")) {
      const preview = computeDeveloperScore({
        address,
        totalLaunches: 0,
        graduatedCount: 0,
        abandonedCount: 0,
        activeCount: 0,
        medianSurvivalSeconds: null,
        medianPeakMultiple: null,
      });
      return NextResponse.json({
        found: false,
        address,
        previewScore: preview,
        note: "Database not connected. No fabricated history.",
      });
    }
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

const UpsertSchema = z.object({
  address: z.string().min(32).max(64),
  totalLaunches: z.number().int().min(0),
  graduatedCount: z.number().int().min(0),
  abandonedCount: z.number().int().min(0),
  activeCount: z.number().int().min(0),
  medianSurvivalSeconds: z.number().nullable().optional(),
  medianPeakMultiple: z.number().nullable().optional(),
  riskIndicators: z.array(z.string()).optional(),
});

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const parsed = UpsertSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: "Invalid stats payload" }, { status: 400 });
    }

    const result = await developerService.upsertFromStats({
      address: parsed.data.address,
      totalLaunches: parsed.data.totalLaunches,
      graduatedCount: parsed.data.graduatedCount,
      abandonedCount: parsed.data.abandonedCount,
      activeCount: parsed.data.activeCount,
      medianSurvivalSeconds: parsed.data.medianSurvivalSeconds ?? null,
      medianPeakMultiple: parsed.data.medianPeakMultiple ?? null,
      riskIndicators: parsed.data.riskIndicators,
    });

    return NextResponse.json({
      developer: {
        address: result.developer.address,
        score: result.stats.score,
        confidence: result.stats.confidence,
        sampleSize: result.stats.sampleSize,
        successfulLaunchRatio: result.stats.successfulLaunchRatio,
      },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Upsert failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
