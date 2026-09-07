/**
 * Lightweight session helper.
 * Production will use next-auth or jose JWTs with proper rotation.
 * For now: simple signed cookie + user lookup.
 */

import { cookies } from "next/headers";
import { SignJWT, jwtVerify } from "jose";
import { prisma } from "@/lib/db/prisma";

const COOKIE_NAME = "pump_auto_session";

function getSecret() {
  const secret = process.env.AUTH_SECRET || process.env.NEXTAUTH_SECRET;
  if (!secret) {
    throw new Error("AUTH_SECRET is required");
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

export async function ensureDevUser(): Promise<string> {
  const existing = await prisma.user.findFirst({
    orderBy: { createdAt: "asc" },
  });
  if (existing) return existing.id;

  const user = await prisma.user.create({
    data: {
      username: "trader",
      profile: {
        create: { displayName: "Trader" },
      },
    },
  });
  return user.id;
}
