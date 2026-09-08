/**
 * PUMP AUTO — Telegram fast-action control layer.
 * Same engines as web: wallets, hunter state, risk, orders.
 * Never logs secrets.
 */

import { prisma } from "@/lib/db/prisma";
import { walletService } from "@/lib/solana/wallet-service";
import {
  getHunterState,
  setHunterState,
  isHunterActive,
} from "@/lib/hunter/state";
import { createTokenDiscovery } from "@/lib/solana/token-discovery";
import { analyzeBatch, DEFAULT_FILTERS } from "@/engines/scanner-pipeline";
import { redactSecrets } from "@/lib/security/wallet-encryption";

const API = "https://api.telegram.org";

const pendingImport = new Map<number, "key" | "none">();
const chatUser = new Map<number, string>();

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
  if (!data.ok) throw new Error(data.description || `Telegram ${method} failed`);
  return data.result;
}

function kb(rows: { text: string; callback_data: string }[][]) {
  return { inline_keyboard: rows };
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

async function answerCallback(id: string) {
  try {
    await tg("answerCallbackQuery", { callback_query_id: id });
  } catch {
    /* ignore */
  }
}

async function ensureTgUser(chatId: number, username?: string): Promise<string> {
  const existing = chatUser.get(chatId);
  if (existing) {
    const u = await prisma.user.findUnique({ where: { id: existing } });
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

function shortAddr(a: string) {
  return a.length > 12 ? `${a.slice(0, 4)}…${a.slice(-4)}` : a;
}

async function screenStart(chatId: number) {
  await sendMessage(
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
      [{ text: "MAIN MENU", callback_data: "menu" }],
    ])
  );
}

async function screenTerms(chatId: number) {
  await sendMessage(
    chatId,
    [
      "<b>BEFORE YOU START</b>",
      "",
      "PUMP AUTO is a non-custodial trading terminal.",
      "",
      "Never share seed / private key / recovery phrase.",
      "PUMP AUTO will never ask for these in Telegram.",
      "Keys are encrypted AES-256-GCM server-side.",
    ].join("\n"),
    kb([
      [{ text: "ACCEPT & CONTINUE", callback_data: "terms_ok" }],
      [{ text: "CANCEL", callback_data: "start" }],
    ])
  );
}

async function screenMenu(chatId: number, userId: string) {
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
  const positions = await prisma.position.count({
    where: { userId, status: { in: ["OPEN", "PARTIAL"] } },
  });
  const online = isHunterActive(hunter) ? "● HUNTER ON" : "● SYSTEM ONLINE";
  await sendMessage(
    chatId,
    [
      "<b>PUMP AUTO</b>",
      online,
      "",
      wallet
        ? `Wallet\n<code>${shortAddr(wallet.publicKey)}</code>\n${bal.toFixed(4)} SOL`
        : "Wallet\n— none —",
      `Positions  ${positions}`,
      `Hunter     ${hunter.state}`,
      `Passed     ${hunter.passedFilters}`,
      `Entries    ${hunter.entriesToday}`,
    ].join("\n"),
    kb([
      [
        { text: "HUNT", callback_data: "hunt" },
        { text: "POSITIONS", callback_data: "positions" },
      ],
      [
        { text: "PORTFOLIO", callback_data: "portfolio" },
        { text: "ACTIVITY", callback_data: "activity" },
      ],
      [
        { text: "WALLET", callback_data: "wallet" },
        { text: "STATUS", callback_data: "status" },
      ],
      [{ text: "⚠ EMERGENCY STOP", callback_data: "emergency" }],
    ])
  );
}

async function screenHunt(chatId: number) {
  const h = await getHunterState();
  const active = isHunterActive(h);
  await sendMessage(
    chatId,
    [
      "<b>AUTO-HUNTER</b>",
      `Status:  ${active ? "● ON" : "○ OFF"} (${h.state})`,
      `Found:   ${h.opportunitiesFound}`,
      `Passed:  ${h.passedFilters}`,
      `Entries: ${h.entriesToday}`,
    ].join("\n"),
    kb([
      active
        ? [{ text: "STOP HUNTER", callback_data: "hunt_stop" }]
        : [{ text: "START HUNTER", callback_data: "hunt_confirm" }],
      [{ text: "SCAN NOW", callback_data: "hunt_scan" }],
      [{ text: "« MENU", callback_data: "menu" }],
    ])
  );
}

async function screenHuntConfirm(chatId: number) {
  const size = process.env.BOT_TRADE_SOL || "0.05";
  await sendMessage(
    chatId,
    [
      "<b>START AUTO-HUNTER?</b>",
      "",
      `Trade size: ${size} SOL`,
      "Min score: 55 · Min liq $3K · Max risk HIGH",
      "",
      "Same risk + execution engines as web.",
    ].join("\n"),
    kb([
      [{ text: "START", callback_data: "hunt_start" }],
      [{ text: "CANCEL", callback_data: "hunt" }],
    ])
  );
}

async function doHuntStart(chatId: number) {
  const h = await getHunterState();
  if (h.emergencyStop) {
    await sendMessage(chatId, "⛔ Emergency stop active. Clear it first.");
    return;
  }
  await setHunterState({ state: "SCANNING", startedAt: new Date().toISOString() });
  await sendMessage(
    chatId,
    "<b>AUTO-HUNTER</b>\n● SCANNING\n\nWorker filters tokens and queues risk-approved entries.",
    kb([[{ text: "HUNTER STATUS", callback_data: "hunt" }]])
  );
}

async function doHuntStop(chatId: number) {
  await setHunterState({ state: "OFF", startedAt: null });
  await sendMessage(chatId, "AUTO-HUNTER\n○ OFF");
}

async function doHuntScan(chatId: number) {
  await sendMessage(chatId, "Scanning…");
  try {
    const discovery = createTokenDiscovery();
    const discovered = await discovery.getRecentTokens(25);
    const ops = analyzeBatch(discovered, DEFAULT_FILTERS);
    const passed = ops
      .filter((o) => o.passedFilters)
      .sort((a, b) => b.score.overall - a.score.overall);
    await setHunterState({
      opportunitiesFound: discovered.length,
      passedFilters: passed.length,
      lastScanAt: new Date().toISOString(),
    });
    const lines = [
      "<b>SCAN RESULT</b>",
      `Detected: ${discovered.length}`,
      `Qualified: ${passed.length}`,
      "",
    ];
    for (const o of passed.slice(0, 5)) {
      lines.push(
        `<b>$${o.symbol || "???"}</b> score ${o.score.overall} risk ${o.score.risk}`
      );
    }
    if (!passed.length) lines.push("No tokens passed filters.");
    await sendMessage(
      chatId,
      lines.join("\n"),
      kb([
        [{ text: "START HUNTER", callback_data: "hunt_confirm" }],
        [{ text: "« HUNT", callback_data: "hunt" }],
      ])
    );
  } catch (err) {
    await sendMessage(
      chatId,
      `Scan failed: ${err instanceof Error ? err.message : "error"}`
    );
  }
}

async function screenPositions(chatId: number, userId: string) {
  const open = await prisma.position.findMany({
    where: { userId, status: { in: ["OPEN", "PARTIAL"] } },
    orderBy: { openedAt: "desc" },
    take: 10,
  });
  if (!open.length) {
    await sendMessage(
      chatId,
      "<b>OPEN POSITIONS</b>\nNone.",
      kb([[{ text: "« MENU", callback_data: "menu" }]])
    );
    return;
  }
  const lines = ["<b>OPEN POSITIONS</b>", ""];
  for (const p of open) {
    const pnl = Number(p.unrealizedPnlSol || 0);
    lines.push(
      `• <code>${shortAddr(p.mint)}</code>`,
      `  ${Number(p.entryAmountSol).toFixed(3)} SOL  PnL ${pnl >= 0 ? "+" : ""}${pnl.toFixed(4)}`,
      ""
    );
  }
  await sendMessage(
    chatId,
    lines.join("\n"),
    kb([[{ text: "« MENU", callback_data: "menu" }]])
  );
}

async function screenPortfolio(chatId: number, userId: string) {
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
  await sendMessage(
    chatId,
    [
      "<b>PORTFOLIO</b>",
      `SOL: ${bal.toFixed(4)}`,
      `Positions: ${open.length}`,
      `Exposure: ${exposure.toFixed(4)}`,
      `Unrealized: ${unreal >= 0 ? "+" : ""}${unreal.toFixed(4)}`,
    ].join("\n"),
    kb([
      [{ text: "POSITIONS", callback_data: "positions" }],
      [{ text: "« MENU", callback_data: "menu" }],
    ])
  );
}

async function screenActivity(chatId: number, userId: string) {
  const events = await prisma.activityEvent.findMany({
    where: { userId },
    orderBy: { createdAt: "desc" },
    take: 12,
  });
  if (!events.length) {
    await sendMessage(chatId, "<b>ACTIVITY</b>\nNo events yet.");
    return;
  }
  const lines = ["<b>ACTIVITY</b>", ""];
  for (const e of events) {
    const t = e.createdAt.toISOString().slice(11, 16);
    lines.push(`${t}  ${(e.message || e.type).slice(0, 80)}`);
  }
  await sendMessage(
    chatId,
    lines.join("\n"),
    kb([[{ text: "« MENU", callback_data: "menu" }]])
  );
}

async function screenWallet(chatId: number, userId: string) {
  const wallet = await primaryWallet(userId);
  if (!wallet) {
    await sendMessage(
      chatId,
      "<b>WALLET</b>\nNo wallet yet.",
      kb([
        [{ text: "CREATE WALLET", callback_data: "wallet_create" }],
        [{ text: "IMPORT WALLET", callback_data: "wallet_import" }],
      ])
    );
    return;
  }
  let bal = 0;
  try {
    bal = (await walletService.getBalance(wallet.id, userId)) ?? 0;
  } catch {
    /* */
  }
  await sendMessage(
    chatId,
    [
      "<b>WALLET</b>",
      `<code>${wallet.publicKey}</code>`,
      `SOL: ${bal.toFixed(4)}`,
      "",
      "Fund on Solana mainnet. Keys never appear in replies.",
    ].join("\n"),
    kb([
      [{ text: "CREATE ANOTHER", callback_data: "wallet_create" }],
      [{ text: "« MENU", callback_data: "menu" }],
    ])
  );
}

async function screenStatus(chatId: number) {
  const h = await getHunterState();
  await sendMessage(
    chatId,
    [
      "<b>SYSTEM</b>",
      `DB: ${process.env.DATABASE_URL ? "●" : "○"}`,
      `Redis: ${process.env.REDIS_URL ? "●" : "○"}`,
      `RPC: ${process.env.SOLANA_RPC_URL || process.env.HELIUS_RPC_URL ? "●" : "○"}`,
      `Hunter: ${h.state}`,
      `Emergency: ${h.emergencyStop ? "ON" : "off"}`,
    ].join("\n"),
    kb([[{ text: "« MENU", callback_data: "menu" }]])
  );
}

async function doCreateWallet(chatId: number, userId: string) {
  await sendMessage(chatId, "CREATE WALLET\nGenerating…");
  try {
    const wallet = await walletService.createWallet(userId, "Telegram");
    await sendMessage(
      chatId,
      [
        "<b>WALLET READY</b>",
        "✓ Created · ✓ Encrypted",
        "",
        `<code>${wallet.publicKey}</code>`,
        "Balance: 0 SOL",
      ].join("\n"),
      kb([
        [{ text: "OPEN TERMINAL", callback_data: "menu" }],
        [{ text: "HUNT", callback_data: "hunt" }],
      ])
    );
  } catch (err) {
    await sendMessage(
      chatId,
      `Create failed: ${redactSecrets(err instanceof Error ? err.message : "error")}`
    );
  }
}

async function doImportStart(chatId: number) {
  pendingImport.set(chatId, "key");
  await sendMessage(
    chatId,
    [
      "<b>IMPORT WALLET</b>",
      "Paste base58 private key as next message.",
      "Encrypted immediately — never logged or echoed.",
    ].join("\n"),
    kb([[{ text: "CANCEL", callback_data: "wallet_import_cancel" }]])
  );
}

async function doImportKey(chatId: number, userId: string, text: string) {
  pendingImport.delete(chatId);
  try {
    const wallet = await walletService.importWallet(
      userId,
      text.trim(),
      "Telegram import"
    );
    await sendMessage(
      chatId,
      `<b>WALLET IMPORTED ✓</b>\n<code>${wallet.publicKey}</code>`,
      kb([[{ text: "CONTINUE", callback_data: "menu" }]])
    );
  } catch (err) {
    await sendMessage(
      chatId,
      `Import failed: ${redactSecrets(err instanceof Error ? err.message : "error")}`
    );
  }
}

async function onCallback(
  chatId: number,
  data: string,
  cbId: string,
  username?: string
) {
  const userId = await ensureTgUser(chatId, username);
  await answerCallback(cbId);
  switch (data) {
    case "start":
      return screenStart(chatId);
    case "terms":
      return screenTerms(chatId);
    case "terms_ok":
      return screenStart(chatId);
    case "menu":
      return screenMenu(chatId, userId);
    case "hunt":
      return screenHunt(chatId);
    case "hunt_confirm":
      return screenHuntConfirm(chatId);
    case "hunt_start":
      return doHuntStart(chatId);
    case "hunt_stop":
      return doHuntStop(chatId);
    case "hunt_scan":
      return doHuntScan(chatId);
    case "positions":
      return screenPositions(chatId, userId);
    case "portfolio":
      return screenPortfolio(chatId, userId);
    case "activity":
      return screenActivity(chatId, userId);
    case "wallet":
      return screenWallet(chatId, userId);
    case "wallet_create":
      return doCreateWallet(chatId, userId);
    case "wallet_import":
      return doImportStart(chatId);
    case "wallet_import_cancel":
      pendingImport.delete(chatId);
      return screenStart(chatId);
    case "status":
      return screenStatus(chatId);
    case "emergency":
      return sendMessage(
        chatId,
        "<b>⚠ EMERGENCY STOP</b>\nStops new entries. Does not sell or withdraw.",
        kb([
          [{ text: "STOP AUTOMATION", callback_data: "emergency_yes" }],
          [{ text: "CANCEL", callback_data: "menu" }],
        ])
      );
    case "emergency_yes":
      await setHunterState({ state: "RISK_HALTED", emergencyStop: true });
      return sendMessage(chatId, "⛔ AUTOMATION STOPPED\nPositions remain open.");
    default:
      return sendMessage(chatId, "Unknown. /start");
  }
}

async function onText(chatId: number, text: string, username?: string) {
  const userId = await ensureTgUser(chatId, username);
  const cmd = text.trim().split(/\s+/)[0].toLowerCase().replace(/@\w+$/, "");
  if (pendingImport.get(chatId) === "key" && !text.startsWith("/")) {
    return doImportKey(chatId, userId, text);
  }
  if (cmd === "/start") return screenStart(chatId);
  if (cmd === "/menu" || cmd === "/help") return screenMenu(chatId, userId);
  if (cmd === "/hunt") return screenHunt(chatId);
  if (cmd === "/positions") return screenPositions(chatId, userId);
  if (cmd === "/wallet") return screenWallet(chatId, userId);
  if (cmd === "/status") return screenStatus(chatId);
  if (cmd === "/stop") {
    await setHunterState({ state: "OFF", startedAt: null });
    return sendMessage(chatId, "Hunter stopped.");
  }
  return sendMessage(
    chatId,
    "/start /menu /hunt /positions /wallet /status /stop",
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
    message?: { chat: { id: number } };
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
          u.callback_query.from?.username
        );
      } else if (u.message?.text) {
        await onText(u.message.chat.id, u.message.text, u.message.from?.username);
      }
    } catch (err) {
      console.error(
        "[telegram] handle:",
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
  console.log("[telegram] polling started");
  try {
    await tg("deleteWebhook", { drop_pending_updates: true });
    console.log("[telegram] webhook cleared");
  } catch (err) {
    console.warn("[telegram] deleteWebhook:", err instanceof Error ? err.message : err);
  }
  for (;;) {
    try {
      await telegramPollOnce();
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error("[telegram] poll error:", msg);
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
    await sendMessage(chatId, text);
  } catch {
    /* */
  }
}
