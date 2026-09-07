/**
 * Telegram command router.
 * Every command resolves a linked User first — there is no "session"
 * concept over Telegram, the linked telegramChatId IS the identity.
 */

import { v4 as uuidv4 } from "uuid";
import { prisma } from "@/lib/db/prisma";
import { walletService } from "@/lib/solana/wallet-service";
import { positionService } from "@/lib/positions/position-service";
import { orderService } from "@/lib/orders/order-service";
import { riskEngine, type RiskContext } from "@/engines/risk-engine";
import { recordActivity } from "@/lib/activity";
import type { InlineKeyboardButton } from "@/lib/telegram/client";
import { recordEvent, queueEvent } from "@/lib/events";

export interface CommandResult {
  text: string;
  keyboard?: InlineKeyboardButton[][];
}

const keyboard = (...rows: InlineKeyboardButton[][]): InlineKeyboardButton[][] => rows;
const button = (text: string, callback_data: string): InlineKeyboardButton => ({ text, callback_data });

async function getLinkedUser(chatId: string) {
  return prisma.user.findUnique({
    where: { telegramChatId: chatId },
    include: {
      wallets: {
        where: { isActive: true },
        orderBy: [{ isPrimary: "desc" }, { createdAt: "asc" }],
        include: { riskSettings: true },
      },
    },
  });
}

type LinkedUser = NonNullable<Awaited<ReturnType<typeof getLinkedUser>>>;
type LinkedWallet = LinkedUser["wallets"][number];

const NOT_LINKED =
  "This Telegram account isn't linked yet.\n\n" +
  "Open PUMP AUTO → Settings → Telegram to get a link code, then send:\n" +
  "`/link YOUR_CODE`";

function fmtSol(n: number): string {
  return `${n >= 0 ? "" : ""}${n.toFixed(4)} SOL`;
}

async function buildRiskContext(
  user: { id: string },
  wallet: LinkedWallet,
  mint: string,
  amountSol: number
): Promise<RiskContext> {
  const summary = await positionService.portfolioSummary(user.id);
  const existingPositionForMint = summary.positions.some((p) => p.mint === mint);
  const lastOrder = await prisma.order.findFirst({
    where: { userId: user.id, state: { in: ["CONFIRMED", "SUBMITTED", "CONFIRMING"] } },
    orderBy: { createdAt: "desc" },
    select: { createdAt: true },
  });

  const rs = wallet.riskSettings;
  return {
    userId: user.id,
    walletId: wallet.id,
    amountSol,
    mint,
    dailyRealizedPnlSol: summary.realizedPnlSol,
    currentExposureSol: summary.exposureSol,
    openPositionCount: summary.positionCount,
    lastTradeAt: lastOrder?.createdAt ?? null,
    emergencyStop: rs?.emergencyStop ?? false,
    maxDailyLossSol: Number(rs?.maxDailyLossSol ?? 1),
    maxPerTradeSol: Number(rs?.maxPerTradeSol ?? 0.5),
    maxWalletExposureSol: Number(rs?.maxWalletExposureSol ?? 5),
    maxConcurrentPositions: rs?.maxConcurrentPositions ?? 5,
    cooldownSeconds: rs?.cooldownSeconds ?? 60,
    existingPositionForMint,
  };
}

async function handleStart(chatId: string, payload: string | undefined): Promise<CommandResult> {
  if (payload) {
    return handleLink(chatId, payload);
  }
  return {
    text:
      "*PUMP AUTO SOLANA TRADING TERMINAL*\n\n" +
      "Fund your wallet. Find opportunities. Trade automatically.\n\n" +
      "Before continuing, review terms and security.",
    keyboard: keyboard([
      button("CREATE WALLET", "onboard:create"),
      button("IMPORT WALLET", "onboard:import"),
    ], [button("TERMS & SECURITY", "onboard:terms")]),
  };
}

async function handleLink(chatId: string, code: string): Promise<CommandResult> {
  const trimmed = code.trim();
  if (!trimmed) {
    return { text: "Usage: `/link YOUR_CODE`" };
  }

  const user = await prisma.user.findUnique({ where: { telegramLinkCode: trimmed } });
  if (!user) {
    return { text: "That code isn't valid or has expired. Generate a new one in Settings → Telegram." };
  }

  const alreadyLinkedElsewhere = await prisma.user.findUnique({ where: { telegramChatId: chatId } });
  if (alreadyLinkedElsewhere && alreadyLinkedElsewhere.id !== user.id) {
    return { text: "This Telegram account is already linked to a different PUMP AUTO account." };
  }

  await prisma.user.update({
    where: { id: user.id },
    data: { telegramChatId: chatId, telegramLinkCode: null, telegramLinkedAt: new Date() },
  });

  await recordActivity({
    userId: user.id,
    type: "TELEGRAM_LINKED",
    message: "Telegram account linked",
    severity: "SUCCESS",
  });

  return { text: "✅ Linked. Send /help to see available commands." };
}

async function handleHelp(): Promise<CommandResult> {
  return {
    text: "*PUMP AUTO · SYSTEM ONLINE*\n\nFUND → HUNT → ANALYZE → TRADE → MONITOR → EXIT\n\nChoose an action:",
    keyboard: keyboard(
      [button("HUNT", "menu:hunt"), button("TRADE", "menu:trade"), button("POSITIONS", "menu:positions")],
      [button("SMART DEVS", "menu:devs"), button("SMART MONEY", "menu:money")],
      [button("PORTFOLIO", "menu:portfolio"), button("ACTIVITY", "menu:activity")],
      [button("WALLET", "menu:wallet"), button("SETTINGS", "menu:settings")],
      [button("EMERGENCY STOP", "menu:stop")],
    ),
  };
}

async function handleCallback(chatId: string, action: string): Promise<CommandResult> {
  if (action === "onboard:terms") return {
    text: "*BEFORE YOU START*\n\nPUMP AUTO is a non-custodial trading terminal. Never share your seed phrase, private key, or recovery phrase. PUMP AUTO will never ask for these through Telegram.",
    keyboard: keyboard([button("ACCEPT & CONTINUE", "onboard:accepted")]),
  };
  if (action === "onboard:create" || action === "onboard:import") return {
    text: action.endsWith("create") ? "*CREATE WALLET*\n\nWallet creation is handled securely in the web terminal. Open Settings → Wallets to create and encrypt a wallet, then return here and send /link CODE." : "*IMPORT WALLET*\n\nImport is handled securely in the web terminal. Credentials are encrypted immediately and never logged. Open Settings → Wallets, then return here and send /link CODE.",
    keyboard: keyboard([button("TERMS & SECURITY", "onboard:terms")]),
  };
  if (action === "onboard:accepted") return handleStart(chatId, undefined);
  const user = await getLinkedUser(chatId);
  if (!user) return { text: NOT_LINKED };
  if (action === "menu:hunt") return handleHunter(user.id, []);
  if (action === "menu:positions") return handlePositions(user.id);
  if (action === "menu:portfolio") return handlePortfolio(user.id);
  if (action === "menu:activity") return handleActivity(user.id);
  if (action === "menu:wallet") return handleBalance(user.id, user.wallets);
  if (action === "menu:settings") return {
    text: "*SETTINGS*\n\nWallet and Telegram linking are managed securely in the web terminal.\n\nUse /unlink to disconnect this chat.",
    keyboard: keyboard([button("HELP", "menu:help"), button("EMERGENCY STOP", "menu:stop")]),
  };
  if (action === "menu:devs" || action === "menu:money") return {
    text: "This intelligence feed is available from the web terminal. Use HUNT to open the scanner workflow.",
    keyboard: keyboard([button("HUNT", "menu:hunt"), button("BACK", "menu:help")]),
  };
  if (action === "menu:help") return handleHelp();
  if (action === "menu:stop") return {
    text: "Emergency stop blocks new automated entries and leaves existing positions untouched. Confirm to continue.",
    keyboard: keyboard([button("CONFIRM STOP", "action:stop:confirm"), button("CANCEL", "menu:help")]),
  };
  if (action === "action:stop:confirm") return handleEmergencyStop(user.id, true);
  if (action === "menu:trade") return { text: "*MANUAL TRADE*\n\nSend `/buy TOKEN_MINT AMOUNT_SOL` to submit a risk-checked order.\n\nExample: `/buy MINT 0.25`" };
  return handleHelp();
}

async function handleBalance(userId: string, wallets: LinkedWallet[]): Promise<CommandResult> {
  if (!wallets.length) {
    return { text: "No wallets yet. Create one in the app first." };
  }
  const lines = await Promise.all(
    wallets.map(async (w) => {
      try {
        const bal = await walletService.getBalance(w.id, userId);
        return `${w.isPrimary ? "⭐ " : ""}${w.name}: ${fmtSol(bal)}\n\`${w.publicKey}\``;
      } catch {
        return `${w.name}: balance unavailable`;
      }
    })
  );
  return { text: `*Wallet balances*\n\n${lines.join("\n\n")}` };
}

async function handlePortfolio(userId: string): Promise<CommandResult> {
  const summary = await positionService.portfolioSummary(userId);
  return {
    text:
      `*Portfolio*\n\n` +
      `Realized: ${fmtSol(summary.realizedPnlSol)}\n` +
      `Unrealized: ${fmtSol(summary.unrealizedPnlSol)}\n` +
      `Exposure: ${fmtSol(summary.exposureSol)}\n` +
      `Open positions: ${summary.positionCount}`,
  };
}

async function handlePositions(userId: string): Promise<CommandResult> {
  const open = await positionService.listOpen(userId);
  if (!open.length) return { text: "No open positions." };

  const lines = open.map((p) => {
    const pnl = Number(p.unrealizedPnlSol);
    return (
      `*$${p.mint.slice(0, 6)}…*\n` +
      `Entry: ${fmtSol(Number(p.entryAmountSol))}  PnL: ${pnl >= 0 ? "+" : ""}${pnl.toFixed(4)} SOL\n` +
      `Status: ${p.status}`
    );
  });
  return { text: lines.join("\n\n") };
}

async function handleBuy(user: LinkedUser, args: string[]): Promise<CommandResult> {
  const [mint, amountStr] = args;
  const amountSol = Number(amountStr);
  if (!mint || !amountStr || !Number.isFinite(amountSol) || amountSol <= 0) {
    return { text: "Usage: `/buy MINT AMOUNT_SOL`\ne.g. `/buy 7xK...92P 0.25`" };
  }
  const wallet = user.wallets[0];
  if (!wallet) return { text: "No active wallet found." };

  const riskCtx = await buildRiskContext(user, wallet, mint, amountSol);
  const { order, risk } = await orderService.createAndRiskCheck({
    userId: user.id,
    walletId: wallet.id,
    mint,
    side: "BUY",
    amountSol,
    riskContext: riskCtx,
  });

  if (!risk.approved) {
    return { text: `🚫 *Trade blocked*\n${risk.reason}` };
  }
  await queueEvent("trade-intents", { type: "trade.intent", userId: user.id, orderId: order.id });
  return {
    text: `✅ Order approved and queued.\n${amountSol} SOL → \`${mint}\`\nOrder: \`${order.id.slice(0, 8)}\`\n\nExecution + confirmation will be pushed here.`,
  };
}

async function handleSell(user: LinkedUser, args: string[]): Promise<CommandResult> {
  const [mint, pctStr] = args;
  const pct = Number(pctStr);
  if (!mint || !pctStr || !Number.isFinite(pct) || pct <= 0 || pct > 100) {
    return { text: "Usage: `/sell MINT PERCENT`\ne.g. `/sell 7xK...92P 50`" };
  }

  const position = await prisma.position.findFirst({
    where: { userId: user.id, mint, status: { in: ["OPEN", "PARTIAL"] } },
  });
  if (!position) return { text: `No open position for \`${mint}\`.` };

  const wallet = user.wallets.find((w) => w.id === position.walletId) ?? user.wallets[0];
  const tokenAmount = Number(position.currentAmountToken) * (pct / 100);

  // NOTE: the execution worker currently treats Order.amountSol as the raw
  // input-token amount for SELL orders (same field reused for both sides).
  const { order, risk } = await orderService.createAndRiskCheck({
    userId: user.id,
    walletId: wallet.id,
    mint,
    side: "SELL",
    amountSol: tokenAmount,
    riskContext: await buildRiskContext(user, wallet, mint, 0),
  });

  if (!risk.approved) {
    return { text: `🚫 *Trade blocked*\n${risk.reason}` };
  }
  return {
    text: `✅ Sell order queued: ${pct}% of \`${mint.slice(0, 8)}…\`\nOrder: \`${order.id.slice(0, 8)}\``,
  };
}

async function handleHunter(userId: string, args: string[]): Promise<CommandResult> {
  const action = args[0]?.toLowerCase();

  const session = await prisma.hunterSession.findFirst({
    where: { userId },
    orderBy: { createdAt: "desc" },
  });

  if (!action || action === "status") {
    if (!session) return { text: "Auto-Hunter has never been started." };
    return {
      text:
        `*Auto-Hunter*\n\n` +
        `State: ${session.state}\n` +
        `Market: ${session.marketRegime}\n` +
        `Opportunities: ${session.opportunitiesFound}\n` +
        `Positions: ${session.positions}\n` +
        `Emergency stop: ${session.emergencyStop ? "ON 🛑" : "off"}`,
    };
  }

  if (action === "start") {
    if (session?.emergencyStop) {
      return { text: "🛑 Emergency stop is active. Send /resume first." };
    }
    if (session) {
      await prisma.hunterSession.update({
        where: { id: session.id },
        data: { state: "SCANNING", startedAt: new Date() },
      });
    } else {
      await prisma.hunterSession.create({
        data: { id: uuidv4(), userId, state: "SCANNING", startedAt: new Date() },
      });
    }
    await recordEvent({ type: "hunter.state", userId, state: "SCANNING" });
    return { text: "▶️ Auto-Hunter starting…" };
  }

  if (action === "stop") {
    if (session) {
      await prisma.hunterSession.update({ where: { id: session.id }, data: { state: "OFF" } });
    }
    return { text: "⏹ Auto-Hunter stopped." };
  }

  return { text: "Usage: `/hunter` | `/hunter start` | `/hunter stop`" };
}

async function handleEmergencyStop(userId: string, engage: boolean): Promise<CommandResult> {
  await prisma.walletRiskSetting.updateMany({
    where: { wallet: { userId } },
    data: { emergencyStop: engage },
  });
  await prisma.hunterSession.updateMany({
    where: { userId },
    data: { emergencyStop: engage, state: engage ? "RISK_HALTED" : "OFF" },
  });

  await recordEvent({ type: "emergency.stop", userId, enabled: engage });
  await recordActivity({
    userId,
    type: engage ? "EMERGENCY_STOP" : "EMERGENCY_STOP_CLEARED",
    message: engage
      ? "Emergency stop engaged via Telegram — new automated entries blocked."
      : "Emergency stop cleared via Telegram.",
    severity: engage ? "WARNING" : "INFO",
  });

  return {
    text: engage
      ? "🛑 *Emergency stop engaged.* New automated entries are blocked. Existing positions are untouched — manage them manually or in the app."
      : "✅ Emergency stop cleared.",
  };
}

async function handleActivity(userId: string): Promise<CommandResult> {
  const events = await prisma.activityEvent.findMany({
    where: { userId },
    orderBy: { createdAt: "desc" },
    take: 10,
  });
  if (!events.length) return { text: "No activity yet." };
  const lines = events.map((e) => `\`${e.createdAt.toISOString().slice(11, 19)}\` ${e.message}`);
  return { text: lines.join("\n") };
}

async function handleUnlink(chatId: string): Promise<CommandResult> {
  await prisma.user.updateMany({
    where: { telegramChatId: chatId },
    data: { telegramChatId: null, telegramLinkedAt: null },
  });
  return { text: "Unlinked. Send /link CODE to reconnect." };
}

export async function routeCommand(chatId: string, rawText: string): Promise<CommandResult> {
  const text = rawText.trim();
  if (text.startsWith("onboard:") || text.startsWith("menu:") || text.startsWith("action:")) {
    return handleCallback(chatId, text);
  }
  const [cmdRaw, ...args] = text.split(/\s+/);
  const cmd = cmdRaw.toLowerCase().replace(/@\w+$/, ""); // strip @BotName in group chats

  if (cmd === "/start") return handleStart(chatId, args[0]);
  if (cmd === "/link") return handleLink(chatId, args[0] ?? "");

  // Everything else requires a linked account.
  const user = await getLinkedUser(chatId);
  if (!user) return { text: NOT_LINKED };

  switch (cmd) {
    case "/help":
      return handleHelp();
    case "/balance":
      return handleBalance(user.id, user.wallets);
    case "/portfolio":
      return handlePortfolio(user.id);
    case "/positions":
      return handlePositions(user.id);
    case "/buy":
      return handleBuy(user, args);
    case "/sell":
      return handleSell(user, args);
    case "/hunter":
      return handleHunter(user.id, args);
    case "/stop":
      return handleEmergencyStop(user.id, true);
    case "/resume":
      return handleEmergencyStop(user.id, false);
    case "/activity":
      return handleActivity(user.id);
    case "/unlink":
      return handleUnlink(chatId);
    default:
      return { text: "Unknown command. Send /help to see what I can do." };
  }
}
