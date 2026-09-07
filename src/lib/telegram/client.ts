/**
 * Telegram Bot API — thin fetch wrapper.
 * No SDK dependency; Telegram's HTTP API is small enough not to need one.
 * Never log the bot token. Never include it in error messages.
 */

const API_ROOT = "https://api.telegram.org";

function getToken(): string {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  if (!token) {
    throw new Error("TELEGRAM_BOT_TOKEN is not configured");
  }
  return token;
}

interface TelegramApiResponse<T> {
  ok: boolean;
  result?: T;
  description?: string;
}

async function callTelegram<T>(method: string, payload: Record<string, unknown>): Promise<T> {
  const res = await fetch(`${API_ROOT}/bot${getToken()}/${method}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });

  const data = (await res.json()) as TelegramApiResponse<T>;
  if (!data.ok) {
    throw new Error(`Telegram API ${method} failed: ${data.description || res.status}`);
  }
  return data.result as T;
}

export interface InlineKeyboardButton {
  text: string;
  callback_data?: string;
  url?: string;
}

export async function sendMessage(
  chatId: string,
  text: string,
  options?: {
    parseMode?: "Markdown" | "HTML";
    replyMarkup?: { inline_keyboard: InlineKeyboardButton[][] };
  }
) {
  return callTelegram("sendMessage", {
    chat_id: chatId,
    text,
    parse_mode: options?.parseMode ?? "Markdown",
    reply_markup: options?.replyMarkup,
    disable_web_page_preview: true,
  });
}

export async function answerCallbackQuery(callbackQueryId: string, text?: string) {
  return callTelegram("answerCallbackQuery", {
    callback_query_id: callbackQueryId,
    text,
  });
}

/**
 * Registers the webhook URL with Telegram. Call this once after deploying
 * (e.g. via a one-off script or an authenticated admin route), not on every boot.
 */
export async function setWebhook(url: string, secretToken: string) {
  return callTelegram("setWebhook", {
    url,
    secret_token: secretToken,
    allowed_updates: ["message", "callback_query"],
  });
}

export async function deleteWebhook() {
  return callTelegram("deleteWebhook", {});
}

export async function getWebhookInfo() {
  return callTelegram("getWebhookInfo", {});
}
