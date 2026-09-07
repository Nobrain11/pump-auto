/**
 * Telegram notification dispatch.
 * Fire-and-forget from the app's perspective: a Telegram failure must never
 * break the caller (activity recording, order/position updates, etc.).
 */

import { v4 as uuidv4 } from "uuid";
import { prisma } from "@/lib/db/prisma";
import { sendMessage } from "@/lib/telegram/client";

export async function notifyUserByTelegram(userId: string, text: string): Promise<void> {
  if (!process.env.TELEGRAM_BOT_TOKEN) return;

  try {
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { telegramChatId: true },
    });
    if (!user?.telegramChatId) return;

    await sendMessage(user.telegramChatId, text);

    await prisma.notification.create({
      data: {
        id: uuidv4(),
        userId,
        channel: "telegram",
        title: text.split("\n")[0].slice(0, 120),
        body: text,
      },
    });
  } catch (err) {
    // Notification delivery is best-effort — never throw into the caller.
    console.error(
      "[telegram] notify failed:",
      err instanceof Error ? err.message : "unknown error"
    );
  }
}

/**
 * Which activity types/severities are worth pushing to Telegram.
 * Kept deliberately narrow — trade lifecycle + risk + smart-dev alerts only,
 * not every scanner tick.
 */
const NOTIFY_SEVERITIES = new Set(["SUCCESS", "WARNING", "ERROR"]);
const NOTIFY_TYPES = new Set(["SMART_DEV_LAUNCH"]);

export function shouldNotify(type: string, severity: string): boolean {
  return NOTIFY_SEVERITIES.has(severity) || NOTIFY_TYPES.has(type);
}
