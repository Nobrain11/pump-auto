import { NextRequest, NextResponse } from "next/server";
import { setWebhook, getWebhookInfo } from "@/lib/telegram/client";

export const dynamic = "force-dynamic";

/**
 * One-time (or one-per-redeploy) webhook registration, callable from a browser
 * since there's no local shell in this workflow.
 *
 * Usage after deploying to Railway:
 *   https://YOUR-APP.up.railway.app/api/telegram/setup?key=YOUR_TELEGRAM_WEBHOOK_SECRET
 *
 * The same TELEGRAM_WEBHOOK_SECRET env var doubles as both the Telegram
 * secret_token AND the auth check on this route, so no separate admin
 * secret is needed.
 */
export async function GET(req: NextRequest) {
  const key = req.nextUrl.searchParams.get("key");
  const expected = process.env.TELEGRAM_WEBHOOK_SECRET;

  if (!expected || key !== expected) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const forwardedHost = req.headers.get("x-forwarded-host") ?? req.headers.get("host");
  const forwardedProto = req.headers.get("x-forwarded-proto") ?? "https";
  const appUrl = process.env.NEXT_PUBLIC_APP_URL
    ?? (process.env.VERCEL_PROJECT_PRODUCTION_URL ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}` : undefined)
    ?? (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : undefined)
    ?? (forwardedHost ? `${forwardedProto}://${forwardedHost}` : undefined);
  if (!appUrl) {
    return NextResponse.json({ error: "Unable to determine the deployed app URL" }, { status: 500 });
  }

  const webhookUrl = `${appUrl.replace(/\/$/, "")}/api/telegram/webhook`;
  await setWebhook(webhookUrl, expected);
  const info = await getWebhookInfo();

  return NextResponse.json({ registered: webhookUrl, info });
}
