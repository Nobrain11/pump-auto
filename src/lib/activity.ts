/**
 * Activity Center — every important system event becomes a record.
 * Source of truth is the database; UI reads from here.
 */

import { prisma } from "@/lib/db/prisma";
import { v4 as uuidv4 } from "uuid";

export type ActivitySeverity = "INFO" | "SUCCESS" | "WARNING" | "ERROR";

export interface ActivityInput {
  userId?: string;
  walletId?: string;
  tokenId?: string;
  type: string;
  message: string;
  severity?: ActivitySeverity;
  metadata?: Record<string, unknown>;
}

export async function recordActivity(input: ActivityInput) {
  return prisma.activityEvent.create({
    data: {
      id: uuidv4(),
      userId: input.userId,
      walletId: input.walletId,
      tokenId: input.tokenId,
      type: input.type,
      message: input.message,
      severity: input.severity || "INFO",
      metadata: input.metadata ?? undefined,
    },
  });
}

export async function listActivity(userId: string, limit = 50) {
  return prisma.activityEvent.findMany({
    where: { userId },
    orderBy: { createdAt: "desc" },
    take: limit,
  });
}
