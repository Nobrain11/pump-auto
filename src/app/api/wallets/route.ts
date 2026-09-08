import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireUser } from "@/lib/auth/session";
import { walletService } from "@/lib/solana/wallet-service";
import { redactSecrets } from "@/lib/security/wallet-encryption";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const user = await requireUser();
    const wallets = await walletService.listWallets(user.id);

    const withBalances = await Promise.all(
      wallets.map(async (w) => {
        try {
          const balanceSol = await walletService.getBalance(w.id, user.id);
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
    return NextResponse.json(
      { error: "Failed to list wallets", detail: message },
      { status: 500 }
    );
  }
}

const CreateSchema = z.object({
  name: z.string().min(1).max(64).optional(),
});

export async function POST(req: NextRequest) {
  try {
    const user = await requireUser();

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
    const message = err instanceof Error ? err.message : "Unknown error";
    console.error("[wallets] POST failed:", redactSecrets(message));
    return NextResponse.json(
      { error: "Failed to create wallet", detail: message },
      { status: 500 }
    );
  }
}
