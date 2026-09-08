import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireUser } from "@/lib/auth/session";
import { walletService } from "@/lib/solana/wallet-service";
import { redactSecrets } from "@/lib/security/wallet-encryption";

export const dynamic = "force-dynamic";

const ImportSchema = z.object({
  privateKey: z.string().min(32).max(128),
  name: z.string().min(1).max(64).optional(),
});

export async function POST(req: NextRequest) {
  try {
    const user = await requireUser();

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
