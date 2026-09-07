import { NextResponse } from "next/server";
import { customAlphabet } from "nanoid";
import { getCurrentUser, ensureDevUser, createSession } from "@/lib/auth/session";
import { prisma } from "@/lib/db/prisma";

export const dynamic = "force-dynamic";

// No 0/O/1/I to avoid transcription mistakes when a user types the code by hand.
const generateCode = customAlphabet("23456789ABCDEFGHJKMNPQRSTUVWXYZ", 8);

export async function GET() {
  let user = await getCurrentUser();
  if (!user && process.env.NODE_ENV === "development") {
    const userId = await ensureDevUser();
    await createSession(userId);
    user = await getCurrentUser();
  }
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  if (user.telegramChatId) {
    return NextResponse.json({ linked: true });
  }

  const code = generateCode();
  await prisma.user.update({
    where: { id: user.id },
    data: { telegramLinkCode: code },
  });

  const botUsername = process.env.TELEGRAM_BOT_USERNAME;
  return NextResponse.json({
    linked: false,
    code,
    deepLink: botUsername ? `https://t.me/${botUsername}?start=${code}` : null,
    instructions: `Open the bot on Telegram and send: /link ${code}`,
  });
}

export async function DELETE() {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  await prisma.user.update({
    where: { id: user.id },
    data: { telegramChatId: null, telegramLinkCode: null, telegramLinkedAt: null },
  });
  return NextResponse.json({ linked: false });
}
