/**
 * Lightweight session helper (jose JWT cookie).
 * Guest bootstrap for first-run until full auth is wired.
 */

import { cookies } from "next/headers";
import { SignJWT, jwtVerify } from "jose";
import { prisma } from "@/lib/db/prisma";

const COOKIE_NAME = "pump_auto_session";

function getSecret() {
  const secret =
    process.env.AUTH_SECRET ||
    process.env.NEXTAUTH_SECRET ||
    process.env.SESSION_SECRET;
  if (!secret) {
    console.warn(
      "[auth] AUTH_SECRET missing — using ephemeral fallback. Set AUTH_SECRET on Railway."
    );
    return new TextEncoder().encode("pump-auto-demo-secret-change-me-in-prod");
  }
  return new TextEncoder().encode(secret);
}

export async function createSession(userId: string) {
  const token = await new SignJWT({ sub: userId })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime("30d")
    .sign(getSecret());

  const cookieStore = await cookies();
  cookieStore.set(COOKIE_NAME, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60 * 24 * 30,
  });

  return token;
}

export async function getSessionUserId(): Promise<string | null> {
  try {
    const cookieStore = await cookies();
    const token = cookieStore.get(COOKIE_NAME)?.value;
    if (!token) return null;

    const { payload } = await jwtVerify(token, getSecret());
    const userId = payload.sub;
    if (!userId || typeof userId !== "string") return null;
    return userId;
  } catch {
    return null;
  }
}

export async function getCurrentUser() {
  const userId = await getSessionUserId();
  if (!userId) return null;

  return prisma.user.findUnique({
    where: { id: userId },
    include: {
      profile: true,
      wallets: {
        where: { isActive: true },
        orderBy: [{ isPrimary: "desc" }, { createdAt: "asc" }],
        select: {
          id: true,
          name: true,
          publicKey: true,
          isPrimary: true,
          isActive: true,
          createdAt: true,
        },
      },
    },
  });
}

export async function destroySession() {
  const cookieStore = await cookies();
  cookieStore.delete(COOKIE_NAME);
}

export async function ensureGuestUser(): Promise<string> {
  const existing = await prisma.user.findFirst({
    orderBy: { createdAt: "asc" },
  });
  if (existing) return existing.id;

  const user = await prisma.user.create({
    data: {
      username: `trader_${Date.now().toString(36)}`,
      profile: {
        create: { displayName: "Trader" },
      },
    },
  });
  return user.id;
}

export async function ensureDevUser(): Promise<string> {
  return ensureGuestUser();
}

export async function requireUser() {
  let user = await getCurrentUser();
  if (user) return user;

  const userId = await ensureGuestUser();
  await createSession(userId);
  user = await getCurrentUser();
  if (!user) throw new Error("Failed to bootstrap session");
  return user;
}
