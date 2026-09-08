/**
 * Telegram control surface — same backend as web.
 * Long-polling; no webhook required for Railway worker.
 *
 * Env: TELEGRAM_BOT_TOKEN (required to enable)
 */

const API = "https://api.telegram.org";

export function isTelegramEnabled(): boolean {
  return Boolean(process.env.TELEGRAM_BOT_TOKEN?.trim());
}

async function tg(method: string, body?: Record<string, unknown>) {
  const token = process.env.TELEGRAM_BOT_TOKEN?.trim();
  if (!token) throw new Error("TELEGRAM_BOT_TOKEN missing");
  const res = await fetch(`${API}/bot${token}/${method}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = (await res.json()) as {
    ok: boolean;
    description?: string;
    result?: unknown;
  };
  if (!data.ok) {
    throw new Error(data.description || `Telegram ${method} failed`);
  }
  return data.result;
}

export async function sendMessage(chatId: number | string, text: string) {
  return tg("sendMessage", {
    chat_id: chatId,
    text,
    parse_mode: "HTML",
    disable_web_page_preview: true,
  });
}

type Update = {
  update_id: number;
  message?: {
    message_id: number;
    text?: string;
    chat: { id: number; type: string };
    from?: { id: number; username?: string; first_name?: string };
  };
};

let offset = 0;

function helpText(): string {
  return [
    "<b>PUMP AUTO</b> — Solana terminal",
    "",
    "/start — welcome",
    "/status — system snapshot",
    "/help — commands",
    "",
    "Web terminal and Telegram share the same backend.",
    "Trading requires the web app wallet + risk settings.",
  ].join("\n");
}

async function handleCommand(chatId: number, text: string) {
  const cmd = text.trim().split(/\s+/)[0].toLowerCase().replace(/@\w+$/, "");

  if (cmd === "/start" || cmd === "/help") {
    await sendMessage(chatId, helpText());
    return;
  }

  if (cmd === "/status") {
    const lines = [
      "<b>Status</b>",
      `Time: ${new Date().toISOString()}`,
      `DB: ${process.env.DATABASE_URL ? "configured" : "missing"}`,
      `RPC: ${process.env.SOLANA_RPC_URL || process.env.HELIUS_RPC_URL ? "configured" : "missing"}`,
      `Scanner worker: running with this process`,
      "",
      "Open the web app for Hunt / Terminal / wallets.",
    ];
    await sendMessage(chatId, lines.join("\n"));
    return;
  }

  await sendMessage(
    chatId,
    "Unknown command. Try /help\n\nFull trading controls are in the web terminal."
  );
}

export async function telegramPollOnce(): Promise<void> {
  if (!isTelegramEnabled()) return;

  const updates = (await tg("getUpdates", {
    offset,
    timeout: 25,
    allowed_updates: ["message"],
  })) as Update[];

  for (const u of updates) {
    offset = u.update_id + 1;
    const msg = u.message;
    if (!msg?.text || !msg.chat?.id) continue;
    try {
      await handleCommand(msg.chat.id, msg.text);
    } catch (err) {
      console.error(
        "[telegram] handle failed:",
        err instanceof Error ? err.message : err
      );
    }
  }
}

export async function telegramLoop() {
  if (!isTelegramEnabled()) {
    console.warn("[telegram] TELEGRAM_BOT_TOKEN not set — Telegram disabled");
    return;
  }

  console.log("[telegram] polling started");
  try {
    const pending = (await tg("getUpdates", { offset: -1, timeout: 0 })) as Update[];
    if (pending?.length) {
      offset = pending[pending.length - 1].update_id + 1;
    }
  } catch (err) {
    console.warn("[telegram] offset init:", err instanceof Error ? err.message : err);
  }

  for (;;) {
    try {
      await telegramPollOnce();
    } catch (err) {
      console.error(
        "[telegram] poll error:",
        err instanceof Error ? err.message : err
      );
      await new Promise((r) => setTimeout(r, 3000));
    }
  }
}
