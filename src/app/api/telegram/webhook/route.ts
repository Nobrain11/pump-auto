import { NextRequest, NextResponse } from "next/server";
import { sendMessage, answerCallbackQuery } from "@/lib/telegram/client";
import { routeCommand } from "@/lib/telegram/commands";
import { recordEvent } from "@/lib/events";

export const dynamic = "force-dynamic";

interface TelegramUpdate {
  message?: {
    chat: { id: number };
    text?: string;
  };
  callback_query?: {
    id: string;
    data?: string;
    message?: { chat: { id: number } };
  };
}

export async function POST(req: NextRequest) {
  // Telegram sends this header on every webhook call once secret_token is
  // set via setWebhook — reject anything that doesn't match.
  const secret = req.headers.get("x-telegram-bot-api-secret-token");
  if (!process.env.TELEGRAM_WEBHOOK_SECRET || secret !== process.env.TELEGRAM_WEBHOOK_SECRET) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let update: TelegramUpdate;
  try {
    update = await req.json();
  } catch {
    return NextResponse.json({ ok: true }); // ignore malformed body, ack anyway
  }

  try {
    if (update.message?.text && update.message.chat?.id != null) {
      const chatId = String(update.message.chat.id);
      const isNew = await recordEvent({ type: "telegram.command", chatId, text: update.message.text });
      if (isNew) {
        const result = await routeCommand(chatId, update.message.text);
        await sendMessage(chatId, result.text, {
          replyMarkup: result.keyboard ? { inline_keyboard: result.keyboard } : undefined,
        });
      }
    } else if (update.callback_query) {
      const chatId = update.callback_query.message?.chat?.id;
      await answerCallbackQuery(update.callback_query.id);
      if (chatId != null && update.callback_query.data) {
        const isNew = await recordEvent({ type: "telegram.callback", chatId: String(chatId), action: update.callback_query.data });
        if (isNew) {
          const result = await routeCommand(String(chatId), update.callback_query.data);
          await sendMessage(String(chatId), result.text, {
            replyMarkup: result.keyboard ? { inline_keyboard: result.keyboard } : undefined,
          });
        }
      }
    }
  } catch (err) {
    console.error("[telegram] webhook handling error:", err instanceof Error ? err.message : err);
    // Telegram retries on non-2xx; ack anyway so a transient bug doesn't
    // cause a redelivery storm. The error above is what to check in logs.
  }

  // Always 200 — Telegram doesn't need to know the outcome, only that we received it.
  return NextResponse.json({ ok: true });
}
