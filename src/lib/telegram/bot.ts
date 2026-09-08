/**
 * PUMP AUTO Telegram — exact control flow.
 * Every screen: « BACK. Lists: ↻ REFRESH. Edit in place (no spam).
 */

import { prisma } from "@/lib/db/prisma";
import { walletService } from "@/lib/solana/wallet-service";
import {
  getHunterState,
  setHunterState,
  isHunterActive,
} from "@/lib/hunter/state";
import { redactSecrets } from "@/lib/security/wallet-encryption";

const API = "https://api.telegram.org";
const pendingImport = new Map<number, boolean>();
const chatUser = new Map<number, string>();
const lastMsg = new Map<number, number>();

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
    result?: { message_id?: number };
  };
  if (!data.ok) throw new Error(data.description || method);
  return data.result;
}

type Btn = { text: string; callback_data: string };
function kb(rows: Btn[][]) {
  return { inline_keyboard: rows };
}
const BACK = (to: string): Btn => ({ text: "« BACK", callback_data: to });
const REFRESH = (to: string): Btn => ({ text: "↻ REFRESH", callback_data: to });

async function show(
  chatId: number,
  text: string,
  markup?: unknown,
  editMessageId?: number
) {
  const mid = editMessageId ?? lastMsg.get(chatId);
  if (mid) {
    try {
      await tg("editMessageText", {
        chat_id: chatId,
        message_id: mid,
        text,
        parse_mode: "HTML",
        disable_web_page_preview: true,
        ...(markup ? { reply_markup: markup } : {}),
      });
      lastMsg.set(chatId, mid);
      return mid;
    } catch {
      /* send new */
    }
  }
  const result = await tg("sendMessage", {
    chat_id: chatId,
    text,
    parse_mode: "HTML",
    disable_web_page_preview: true,
    ...(markup ? { reply_markup: markup } : {}),
  });
  if (result?.message_id) lastMsg.set(chatId, result.message_id);
  return result?.message_id;
}

async function answerCallback(id: string) {
  try {
    await tg("answerCallbackQuery", { callback_query_id: id });
  } catch {
    /* */
  }
}

async function ensureTgUser(chatId: number, username?: string): Promise<string> {
  const cached = chatUser.get(chatId);
  if (cached) {
    const u = await prisma.user.findUnique({ where: { id: cached } });
    if (u) return u.id;
  }
  const uname = `tg_${chatId}`;
  let user = await prisma.user.findFirst({ where: { username: uname } });
  if (!user) {
    user = await prisma.user.create({
      data: {
        username: uname,
        profile: {
          create: { displayName: username ? `@${username}` : `TG ${chatId}` },
        },
      },
    });
  }
  chatUser.set(chatId, user.id);
  return user.id;
}

async function primaryWallet(userId: string) {
  return prisma.wallet.findFirst({
    where: { userId, isActive: true },
    orderBy: [{ isPrimary: "desc" }, { createdAt: "asc" }],
  });
}

function short(a: string) {
  return a.length > 12 ? `${a.slice(0, 4)}…${a.slice(-4)}` : a;
}

async function screenStart(chatId: number, mid?: number) {
  await show(
    chatId,
    [
      "<b>PUMP AUTO</b>",
      "SOLANA TRADING TERMINAL",
      "",
      "Fund your wallet.",
      "Find opportunities.",
      "Trade automatically.",
    ].join("\n"),
    kb([
      [{ text: "CREATE WALLET", callback_data: "wallet_create" }],
      [{ text: "IMPORT WALLET", callback_data: "wallet_import" }],
      [{ text: "TERMS & SECURITY", callback_data: "terms" }],
    ]),
    mid
  );
}

async function screenTerms(chatId: number, mid?: number) {
  await show(
    chatId,
    [
      "<b>BEFORE YOU START</b>",
      "",
      "PUMP AUTO is a non-custodial trading terminal.",
      "",
      "Never share your:",
      "• seed phrase",
      "• private key",
      "• recovery phrase",
      "",
      "PUMP AUTO will never ask you for these through Telegram.",
    ].join("\n"),
    kb([
      [{ text: "ACCEPT & CONTINUE", callback_data: "terms_ok" }],
      [BACK("start")],
    ]),
    mid
  );
}

async function doCreateWallet(chatId: number, userId: string, mid?: number) {
  await show(
    chatId,
    "CREATE WALLET\nYour Solana wallet is being generated...",
    undefined,
    mid
  );
  try {
    const w = await walletService.createWallet(userId, "Telegram");
    await show(
      chatId,
      [
        "<b>WALLET READY</b>",
        "✓ Wallet created",
        "✓ Encryption enabled",
        "✓ Wallet secured",
        "",
        "Address:",
        `<code>${w.publicKey}</code>`,
        "Balance:",
        "0 SOL",
      ].join("\n"),
      kb([
        [{ text: "FUND WALLET", callback_data: "wallet" }],
        [{ text: "OPEN TERMINAL", callback_data: "menu" }],
        [BACK("start")],
      ])
    );
  } catch (e) {
    await show(
      chatId,
      `Create failed: ${redactSecrets(e instanceof Error ? e.message : "error")}`,
      kb([[BACK("start")]])
    );
  }
}

async function screenImport(chatId: number, mid?: number) {
  pendingImport.set(chatId, true);
  await show(
    chatId,
    [
      "<b>IMPORT WALLET</b>",
      "Send your base58 private key as the next message.",
      "Encrypted immediately — never logged or echoed.",
    ].join("\n"),
    kb([
      [{ text: "CANCEL", callback_data: "wallet_import_cancel" }],
      [BACK("start")],
    ]),
    mid
  );
}

async function doImport(chatId: number, userId: string, key: string) {
  pendingImport.delete(chatId);
  try {
    const w = await walletService.importWallet(userId, key.trim(), "Telegram");
    let bal = 0;
    try {
      bal = (await walletService.getBalance(w.id, userId)) ?? 0;
    } catch {
      /* */
    }
    await show(
      chatId,
      [
        "<b>WALLET IMPORTED ✓</b>",
        `<code>${w.publicKey}</code>`,
        "Balance:",
        `${bal.toFixed(4)} SOL`,
      ].join("\n"),
      kb([
        [{ text: "CONTINUE", callback_data: "menu" }],
        [BACK("start")],
      ])
    );
  } catch (e) {
    await show(
      chatId,
      `Import failed: ${redactSecrets(e instanceof Error ? e.message : "error")}`,
      kb([[BACK("start")]])
    );
  }
}

async function screenMenu(chatId: number, userId: string, mid?: number) {
  const hunter = await getHunterState();
  const wallet = await primaryWallet(userId);
  let bal = 0;
  if (wallet) {
    try {
      bal = (await walletService.getBalance(wallet.id, userId)) ?? 0;
    } catch {
      bal = 0;
    }
  }
  const pos = await prisma.position.count({
    where: { userId, status: { in: ["OPEN", "PARTIAL"] } },
  });
  const statusLine = isHunterActive(hunter) ? "● HUNTER ON" : "● SYSTEM ONLINE";
  await show(
    chatId,
    [
      "<b>PUMP AUTO</b>",
      statusLine,
      "",
      "Wallet",
      wallet ? `<code>${short(wallet.publicKey)}</code>` : "—",
      wallet ? `${bal.toFixed(4)} SOL` : "0 SOL",
      "",
      `Positions  ${pos}`,
      `Hunter     ${hunter.state}`,
      `Passed     ${hunter.passedFilters}`,
      `Entries    ${hunter.entriesToday}`,
    ].join("\n"),
    kb([
      [
        { text: "HUNT", callback_data: "hunt" },
        { text: "TRADE", callback_data: "trade" },
      ],
      [
        { text: "POSITIONS", callback_data: "positions" },
        { text: "PORTFOLIO", callback_data: "portfolio" },
      ],
      [
        { text: "ACTIVITY", callback_data: "activity" },
        { text: "WALLET", callback_data: "wallet" },
      ],
      [
        { text: "SETTINGS", callback_data: "settings" },
        { text: "STATUS", callback_data: "status" },
      ],
      [{ text: "⚠ EMERGENCY STOP", callback_data: "emergency" }],
      [REFRESH("menu")],
    ]),
    mid
  );
}

async function screenHunt(chatId: number, mid?: number) {
  const h = await getHunterState();
  const on = isHunterActive(h);
  await show(
    chatId,
    [
      "<b>AUTO-HUNTER</b>",
      "Status:",
      on ? "● ON" : "○ OFF",
      `State: ${h.state}`,
      `Market: ${h.marketRegime || "—"}`,
      `Today's entries: ${h.entriesToday}`,
      `Found: ${h.opportunitiesFound}`,
      `Passed: ${h.passedFilters}`,
    ].join("\n"),
    kb([
      on
        ? [{ text: "STOP HUNTER", callback_data: "hunt_stop" }]
        : [{ text: "START HUNTER", callback_data: "hunt_confirm" }],
      [{ text: "SETTINGS", callback_data: "hunt_settings" }],
      [REFRESH("hunt"), BACK("menu")],
    ]),
    mid
  );
}

async function screenHuntConfirm(chatId: number, mid?: number) {
  const size = process.env.BOT_TRADE_SOL || "0.05";
  await show(
    chatId,
    [
      "<b>START AUTO-HUNTER?</b>",
      "",
      "Strategy: AUTO-HUNTER",
      `Trade size: ${size} SOL`,
      "Minimum score: 55",
      "Minimum liquidity: $3K",
      "Maximum risk: HIGH",
      "Daily loss limit: 1 SOL",
    ].join("\n"),
    kb([
      [{ text: "START", callback_data: "hunt_start" }],
      [{ text: "CANCEL", callback_data: "hunt" }],
    ]),
    mid
  );
}

async function screenHuntSettings(chatId: number, mid?: number) {
  const size = process.env.BOT_TRADE_SOL || "0.05";
  await show(
    chatId,
    [
      "<b>AUTO-HUNTER SETTINGS</b>",
      "Minimum score: 55",
      "Minimum liquidity: $3K",
      "Maximum risk: HIGH",
      `Trade size: ${size} SOL`,
      "Max positions: 5",
      "Daily loss limit: 1 SOL",
    ].join("\n"),
    kb([[BACK("hunt")]]),
    mid
  );
}

async function doHuntStart(chatId: number, mid?: number) {
  const h = await getHunterState();
  if (h.emergencyStop) {
    await show(
      chatId,
      "⛔ Emergency stop is active.\nClear it before starting.",
      kb([[BACK("hunt")]]),
      mid
    );
    return;
  }
  await setHunterState({
    state: "SCANNING",
    startedAt: new Date().toISOString(),
  });
  await show(
    chatId,
    [
      "<b>AUTO-HUNTER</b>",
      "● STARTING",
      "",
      "● SCANNING",
      "Worker is filtering opportunities.",
    ].join("\n"),
    kb([[REFRESH("hunt")], [BACK("menu")]]),
    mid
  );
}

async function doHuntStop(chatId: number, mid?: number) {
  await setHunterState({ state: "OFF", startedAt: null });
  await show(
    chatId,
    "<b>AUTO-HUNTER</b>\n○ OFF\nNew entries stopped.",
    kb([[REFRESH("hunt"), BACK("menu")]]),
    mid
  );
}

async function screenTrade(chatId: number, mid?: number) {
  await show(
    chatId,
    [
      "<b>MANUAL TRADE</b>",
      "Use Hunt for automated entries.",
      "Same risk + execution engines as web.",
    ].join("\n"),
    kb([
      [{ text: "OPEN HUNT", callback_data: "hunt" }],
      [BACK("menu")],
    ]),
    mid
  );
}

async function screenPositions(chatId: number, userId: string, mid?: number) {
  const open = await prisma.position.findMany({
    where: { userId, status: { in: ["OPEN", "PARTIAL"] } },
    orderBy: { openedAt: "desc" },
    take: 10,
  });
  if (!open.length) {
    await show(
      chatId,
      "<b>OPEN POSITIONS</b>\nNone.",
      kb([[REFRESH("positions"), BACK("menu")]]),
      mid
    );
    return;
  }
  const lines = ["<b>OPEN POSITIONS</b>", ""];
  open.forEach((p, i) => {
    const pnl = Number(p.unrealizedPnlSol || 0);
    lines.push(
      `${i + 1}. <code>${short(p.mint)}</code>`,
      `PnL ${pnl >= 0 ? "+" : ""}${pnl.toFixed(4)} SOL · ${Number(p.entryAmountSol).toFixed(3)} SOL`,
      ""
    );
  });
  await show(
    chatId,
    lines.join("\n"),
    kb([[REFRESH("positions"), BACK("menu")]]),
    mid
  );
}

async function screenPortfolio(chatId: number, userId: string, mid?: number) {
  const wallet = await primaryWallet(userId);
  let bal = 0;
  if (wallet) {
    try {
      bal = (await walletService.getBalance(wallet.id, userId)) ?? 0;
    } catch {
      /* */
    }
  }
  const open = await prisma.position.findMany({
    where: { userId, status: { in: ["OPEN", "PARTIAL"] } },
  });
  const exposure = open.reduce((s, p) => s + Number(p.entryAmountSol || 0), 0);
  const unreal = open.reduce((s, p) => s + Number(p.unrealizedPnlSol || 0), 0);
  await show(
    chatId,
    [
      "<b>PORTFOLIO</b>",
      `Total: ${bal.toFixed(4)} SOL`,
      `Positions: ${open.length}`,
      `Exposure: ${exposure.toFixed(4)} SOL`,
      `Unrealized: ${unreal >= 0 ? "+" : ""}${unreal.toFixed(4)} SOL`,
    ].join("\n"),
    kb([
      [{ text: "POSITIONS", callback_data: "positions" }],
      [REFRESH("portfolio"), BACK("menu")],
    ]),
    mid
  );
}

async function screenActivity(chatId: number, userId: string, mid?: number) {
  const events = await prisma.activityEvent.findMany({
    where: { userId },
    orderBy: { createdAt: "desc" },
    take: 12,
  });
  const lines = ["<b>ACTIVITY</b>", ""];
  if (!events.length) lines.push("No events yet.");
  for (const e of events) {
    lines.push(
      `${e.createdAt.toISOString().slice(11, 16)} ${(e.message || e.type).slice(0, 70)}`
    );
  }
  await show(
    chatId,
    lines.join("\n"),
    kb([[REFRESH("activity"), BACK("menu")]]),
    mid
  );
}

async function screenWallet(chatId: number, userId: string, mid?: number) {
  const wallet = await primaryWallet(userId);
  if (!wallet) {
    await show(
      chatId,
      "<b>WALLET</b>\nNo wallet yet.",
      kb([
        [{ text: "CREATE WALLET", callback_data: "wallet_create" }],
        [{ text: "IMPORT WALLET", callback_data: "wallet_import" }],
        [BACK("menu")],
      ]),
      mid
    );
    return;
  }
  let bal = 0;
  try {
    bal = (await walletService.getBalance(wallet.id, userId)) ?? 0;
  } catch {
    /* */
  }
  await show(
    chatId,
    [
      "<b>WALLET</b>",
      `<code>${wallet.publicKey}</code>`,
      `SOL: ${bal.toFixed(4)}`,
      "",
      "Fund on Solana mainnet.",
    ].join("\n"),
    kb([
      [{ text: "CREATE WALLET", callback_data: "wallet_create" }],
      [{ text: "IMPORT WALLET", callback_data: "wallet_import" }],
      [REFRESH("wallet"), BACK("menu")],
    ]),
    mid
  );
}

async function screenSettings(chatId: number, mid?: number) {
  await show(
    chatId,
    [
      "<b>SETTINGS</b>",
      "",
      "TRADING",
      "AUTO-HUNTER",
      "SECURITY",
      "WALLETS",
    ].join("\n"),
    kb([
      [{ text: "AUTO-HUNTER", callback_data: "hunt_settings" }],
      [{ text: "WALLETS", callback_data: "wallet" }],
      [BACK("menu")],
    ]),
    mid
  );
}

async function screenEmergency(chatId: number, mid?: number) {
  await show(
    chatId,
    [
      "<b>⚠ EMERGENCY STOP</b>",
      "This will stop new automated entries.",
      "It will NOT:",
      "• sell positions",
      "• withdraw funds",
      "• delete wallets",
      "• close existing positions",
    ].join("\n"),
    kb([
      [{ text: "STOP AUTOMATION", callback_data: "emergency_yes" }],
      [{ text: "CANCEL", callback_data: "menu" }],
    ]),
    mid
  );
}

async function screenStatus(chatId: number, mid?: number) {
  const h = await getHunterState();
  await show(
    chatId,
    [
      "<b>SYSTEM</b>",
      `${process.env.DATABASE_URL ? "●" : "○"} DATABASE`,
      `${process.env.REDIS_URL ? "●" : "○"} REDIS`,
      `${process.env.SOLANA_RPC_URL || process.env.HELIUS_RPC_URL ? "●" : "○"} RPC`,
      `${isHunterActive(h) ? "●" : "○"} HUNTER (${h.state})`,
      `${h.emergencyStop ? "⚠" : "●"} EMERGENCY ${h.emergencyStop ? "ON" : "off"}`,
    ].join("\n"),
    kb([[REFRESH("status"), BACK("menu")]]),
    mid
  );
}

async function route(chatId: number, data: string, userId: string, mid?: number) {
  switch (data) {
    case "start":
      return screenStart(chatId, mid);
    case "terms":
      return screenTerms(chatId, mid);
    case "terms_ok":
      return screenStart(chatId, mid);
    case "menu":
      return screenMenu(chatId, userId, mid);
    case "hunt":
      return screenHunt(chatId, mid);
    case "hunt_confirm":
      return screenHuntConfirm(chatId, mid);
    case "hunt_start":
      return doHuntStart(chatId, mid);
    case "hunt_stop":
      return doHuntStop(chatId, mid);
    case "hunt_settings":
      return screenHuntSettings(chatId, mid);
    case "trade":
      return screenTrade(chatId, mid);
    case "positions":
      return screenPositions(chatId, userId, mid);
    case "portfolio":
      return screenPortfolio(chatId, userId, mid);
    case "activity":
      return screenActivity(chatId, userId, mid);
    case "wallet":
      return screenWallet(chatId, userId, mid);
    case "wallet_create":
      return doCreateWallet(chatId, userId, mid);
    case "wallet_import":
      return screenImport(chatId, mid);
    case "wallet_import_cancel":
      pendingImport.delete(chatId);
      return screenStart(chatId, mid);
    case "settings":
      return screenSettings(chatId, mid);
    case "status":
      return screenStatus(chatId, mid);
    case "emergency":
      return screenEmergency(chatId, mid);
    case "emergency_yes":
      await setHunterState({ state: "RISK_HALTED", emergencyStop: true });
      return show(
        chatId,
        "⛔ AUTOMATION STOPPED\nAuto-Hunter: OFF\nExisting positions remain active.",
        kb([
          [{ text: "RESUME", callback_data: "hunt_confirm" }],
          [BACK("menu")],
        ]),
        mid
      );
    default:
      return show(chatId, "Unknown action.", kb([[BACK("menu")]]), mid);
  }
}

async function onCallback(
  chatId: number,
  data: string,
  cbId: string,
  messageId: number,
  username?: string
) {
  await answerCallback(cbId);
  const userId = await ensureTgUser(chatId, username);
  lastMsg.set(chatId, messageId);
  await route(chatId, data, userId, messageId);
}

async function onText(chatId: number, text: string, username?: string) {
  const userId = await ensureTgUser(chatId, username);
  if (pendingImport.get(chatId) && !text.startsWith("/")) {
    return doImport(chatId, userId, text);
  }
  const cmd = text.trim().split(/\s+/)[0].toLowerCase().replace(/@\w+$/, "");
  if (cmd === "/start") return screenStart(chatId);
  if (cmd === "/menu") return screenMenu(chatId, userId);
  if (cmd === "/hunt") return screenHunt(chatId);
  if (cmd === "/stop") return doHuntStop(chatId);
  return show(
    chatId,
    "Use buttons or /start /menu /hunt /stop",
    kb([[{ text: "MAIN MENU", callback_data: "menu" }]])
  );
}

type Update = {
  update_id: number;
  message?: {
    text?: string;
    chat: { id: number };
    from?: { username?: string };
  };
  callback_query?: {
    id: string;
    data?: string;
    from?: { username?: string };
    message?: { message_id: number; chat: { id: number } };
  };
};

let offset = 0;

export async function telegramPollOnce(): Promise<void> {
  if (!isTelegramEnabled()) return;
  const updates = (await tg("getUpdates", {
    offset,
    timeout: 25,
    allowed_updates: ["message", "callback_query"],
  })) as Update[];

  for (const u of updates) {
    offset = u.update_id + 1;
    try {
      if (u.callback_query?.data && u.callback_query.message) {
        await onCallback(
          u.callback_query.message.chat.id,
          u.callback_query.data,
          u.callback_query.id,
          u.callback_query.message.message_id,
          u.callback_query.from?.username
        );
      } else if (u.message?.text) {
        await onText(u.message.chat.id, u.message.text, u.message.from?.username);
      }
    } catch (err) {
      console.error(
        "[telegram]",
        redactSecrets(err instanceof Error ? err.message : String(err))
      );
    }
  }
}

export async function telegramLoop() {
  if (!isTelegramEnabled()) {
    console.warn("[telegram] TELEGRAM_BOT_TOKEN not set");
    return;
  }
  console.log("[telegram] polling started (exact flow)");
  try {
    await tg("deleteWebhook", { drop_pending_updates: true });
  } catch {
    /* */
  }
  for (;;) {
    try {
      await telegramPollOnce();
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error("[telegram] poll:", msg);
      if (msg.includes("webhook")) {
        try {
          await tg("deleteWebhook", { drop_pending_updates: true });
        } catch {
          /* */
        }
      }
      await new Promise((r) => setTimeout(r, 3000));
    }
  }
}

export async function notifyChat(chatId: number, text: string) {
  if (!isTelegramEnabled()) return;
  try {
    await show(chatId, text, kb([[BACK("menu")]]));
  } catch {
    /* */
  }
}

export async function sendMessage(
  chatId: number | string,
  text: string,
  reply_markup?: unknown
) {
  return tg("sendMessage", {
    chat_id: chatId,
    text,
    parse_mode: "HTML",
    disable_web_page_preview: true,
    ...(reply_markup ? { reply_markup } : {}),
  });
}
