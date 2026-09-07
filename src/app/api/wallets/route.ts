import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getCurrentUser, ensureDevUser, createSession } from "@/lib/auth/session";
import { walletService } from "@/lib/solana/wallet-service";
import { redactSecrets } from "@/lib/security/wallet-encryption";

export const dynamic = "force-dynamic";

export async function GET() {
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

    const wallets = await walletService.listWallets(user.id);

    const withBalances = await Promise.all(
      wallets.map(async (w) => {
        try {
          const balanceSol = await walletService.getBalance(w.id, user!.id);
          return { ...w, balanceSol };
        } catch {
          return { ...w, balanceSol: null };
        }
      })
    );

    return NextResponse.json({ wallets: withBalances });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    console.error("[wallets] GET failed:", redactSecrets(message));
    return NextResponse.json({ error: "Failed to list wallets" }, { status: 500 });
  }
}

const CreateSchema = z.object({
  name: z.string().min(1).max(64).optional(),
});

function walletErrorResponse(err: unknown) {
  const message = err instanceof Error ? err.message : "Unknown error";
  const safeMessage = redactSecrets(message);
  console.error("[wallets] POST failed:", safeMessage);

  if (safeMessage.includes("WALLET_ENCRYPTION_KEY")) {
    return NextResponse.json(
      { error: "Wallet encryption is not configured. Set WALLET_ENCRYPTION_KEY in the deployment environment." },
      { status: 503 }
    );
  }
  if (safeMessage.includes("DATABASE_URL") || safeMessage.includes("Prisma") || safeMessage.includes("database")) {
    return NextResponse.json(
      { error: "Wallet storage is unavailable. Check the database configuration and try again." },
      { status: 503 }
    );
  }
  return NextResponse.json({ error: "Failed to create wallet. Check the server logs for details." }, { status: 500 });
}

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

    const body = await req.json().catch(() => ({}));
    const parsed = CreateSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: "Invalid input" }, { status: 400 });
    }

    const wallet = await walletService.createWallet(
      user.id,
      parsed.data.name || "Main"
    );

    return NextResponse.json({ wallet }, { status: 201 });
  } catch (err) {
    return walletErrorResponse(err);
  }
}
