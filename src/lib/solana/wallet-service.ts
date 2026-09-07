/**
 * Wallet Service
 * - Create new keypair
 * - Import from private key / seed
 * - Encrypt & persist
 * - Never expose private material to API responses or logs
 */

import { Keypair } from "@solana/web3.js";
import bs58 from "bs58";
import { v4 as uuidv4 } from "uuid";
import { prisma } from "@/lib/db/prisma";
import {
  encryptWalletSecret,
  decryptWalletSecret,
  type EncryptedSecret,
} from "@/lib/security/wallet-encryption";
import { createSolanaProvider } from "@/providers/solana-provider";

export interface PublicWalletView {
  id: string;
  name: string;
  publicKey: string;
  isPrimary: boolean;
  isActive: boolean;
  createdAt: Date;
  balanceSol?: number;
}

export class WalletService {
  async createWallet(userId: string, name = "Main"): Promise<PublicWalletView> {
    const keypair = Keypair.generate();
    const publicKey = keypair.publicKey.toBase58();
    const secretKey = bs58.encode(keypair.secretKey);

    const encrypted = encryptWalletSecret(secretKey);

    const existingCount = await prisma.wallet.count({ where: { userId } });
    const isPrimary = existingCount === 0;

    const wallet = await prisma.wallet.create({
      data: {
        id: uuidv4(),
        userId,
        name,
        publicKey,
        isPrimary,
        isActive: true,
        encryptedSecret: {
          create: {
            ciphertext: encrypted.ciphertext,
            iv: encrypted.iv,
            authTag: encrypted.authTag,
            keyVersion: encrypted.keyVersion,
          },
        },
        riskSettings: {
          create: {},
        },
      },
    });

    return {
      id: wallet.id,
      name: wallet.name,
      publicKey: wallet.publicKey,
      isPrimary: wallet.isPrimary,
      isActive: wallet.isActive,
      createdAt: wallet.createdAt,
    };
  }

  async importWallet(
    userId: string,
    secretKeyBase58: string,
    name = "Imported"
  ): Promise<PublicWalletView> {
    let keypair: Keypair;
    try {
      const secret = bs58.decode(secretKeyBase58.trim());
      if (secret.length !== 64) {
        throw new Error("Invalid private key length");
      }
      keypair = Keypair.fromSecretKey(secret);
    } catch {
      throw new Error("Invalid private key format");
    }

    const publicKey = keypair.publicKey.toBase58();

    const existing = await prisma.wallet.findUnique({
      where: { userId_publicKey: { userId, publicKey } },
    });
    if (existing) {
      throw new Error("Wallet already exists for this user");
    }

    const encrypted = encryptWalletSecret(secretKeyBase58.trim());

    const existingCount = await prisma.wallet.count({ where: { userId } });
    const isPrimary = existingCount === 0;

    const wallet = await prisma.wallet.create({
      data: {
        id: uuidv4(),
        userId,
        name,
        publicKey,
        isPrimary,
        isActive: true,
        encryptedSecret: {
          create: {
            ciphertext: encrypted.ciphertext,
            iv: encrypted.iv,
            authTag: encrypted.authTag,
            keyVersion: encrypted.keyVersion,
          },
        },
        riskSettings: {
          create: {},
        },
      },
    });

    return {
      id: wallet.id,
      name: wallet.name,
      publicKey: wallet.publicKey,
      isPrimary: wallet.isPrimary,
      isActive: wallet.isActive,
      createdAt: wallet.createdAt,
    };
  }

  async listWallets(userId: string): Promise<PublicWalletView[]> {
    const wallets = await prisma.wallet.findMany({
      where: { userId, isActive: true },
      orderBy: [{ isPrimary: "desc" }, { createdAt: "asc" }],
    });

    return wallets.map((w) => ({
      id: w.id,
      name: w.name,
      publicKey: w.publicKey,
      isPrimary: w.isPrimary,
      isActive: w.isActive,
      createdAt: w.createdAt,
    }));
  }

  async getBalance(walletId: string, userId: string): Promise<number> {
    const wallet = await prisma.wallet.findFirst({
      where: { id: walletId, userId },
    });
    if (!wallet) {
      throw new Error("Wallet not found");
    }

    const provider = createSolanaProvider();
    return provider.getBalance(wallet.publicKey);
  }

  async getDecryptedSecret(walletId: string, userId: string): Promise<string> {
    const wallet = await prisma.wallet.findFirst({
      where: { id: walletId, userId },
      include: { encryptedSecret: true },
    });

    if (!wallet || !wallet.encryptedSecret) {
      throw new Error("Wallet or secret not found");
    }

    const secret: EncryptedSecret = {
      ciphertext: wallet.encryptedSecret.ciphertext,
      iv: wallet.encryptedSecret.iv,
      authTag: wallet.encryptedSecret.authTag,
      keyVersion: wallet.encryptedSecret.keyVersion,
    };

    return decryptWalletSecret(secret);
  }

  async renameWallet(walletId: string, userId: string, name: string) {
    return prisma.wallet.updateMany({
      where: { id: walletId, userId },
      data: { name },
    });
  }

  async setPrimary(walletId: string, userId: string) {
    await prisma.$transaction([
      prisma.wallet.updateMany({
        where: { userId },
        data: { isPrimary: false },
      }),
      prisma.wallet.updateMany({
        where: { id: walletId, userId },
        data: { isPrimary: true },
      }),
    ]);
  }

  async deactivateWallet(walletId: string, userId: string) {
    return prisma.wallet.updateMany({
      where: { id: walletId, userId },
      data: { isActive: false, isPrimary: false },
    });
  }
}

export const walletService = new WalletService();
