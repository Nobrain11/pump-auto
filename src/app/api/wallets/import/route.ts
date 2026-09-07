import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getCurrentUser, ensureDevUser, createSession } from "@/lib/auth/session";
import { walletService } from "@/lib/solana/wallet-service";
import { redactSecrets } from "@/lib/security/wallet-encryption";

export const dynamic = "force-dynamic";

const ImportSchema = z.object({
  privateKey: z.string().min(32).max(128),
  name: z.string().min(1).max(64).optional(),
});

/**
 * POST /api/wallets/import
 * Import existing wallet from base58 private key.
 * The key is used only to derive the public key + encrypt; never stored plaintext or returned.
 */
export async function POST(req: NextRequest) {
  try {
    let user = await getCurrentUser();
    if (!user) {
      if (process.env.NODE_ENV === "development") {
        const userId = await ensureDevUser();
        await createSession(userId);
        user = await getCurrentUser();
      }
    }
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await req.json();
    const parsed = ImportSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: "Invalid private key or name" }, { status: 400 });
    }

    const wallet = await walletService.importWallet(
      user.id,
      parsed.data.privateKey,
      parsed.data.name || "Imported"
    );

    return NextResponse.json({ wallet }, { status: 201 });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    console.error("[wallets/import] failed:", redactSecrets(message));
    const safeMessage =
      message.includes("Invalid") || message.includes("already exists")
        ? message
        : "Failed to import wallet";
    return NextResponse.json({ error: safeMessage }, { status: 400 });
  }
}
