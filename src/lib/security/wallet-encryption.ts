/**
 * Wallet secret encryption — production grade.
 *
 * - Private keys / seed phrases NEVER stored in plaintext.
 * - AES-256-GCM with random IV per secret.
 * - Key sourced exclusively from environment (WALLET_ENCRYPTION_KEY).
 * - Never log ciphertext, IV, authTag, or decrypted material.
 * - Key versioning supported for future rotation.
 */

import { createCipheriv, createDecipheriv, randomBytes, scryptSync } from "crypto";

const ALGORITHM = "aes-256-gcm";
const IV_LENGTH = 12;
const KEY_LENGTH = 32;
const SALT = "pump-auto-wallet-v1";

function getEncryptionKey(): Buffer {
  const raw = process.env.WALLET_ENCRYPTION_KEY;
  if (!raw || raw.length < 32) {
    throw new Error(
      "WALLET_ENCRYPTION_KEY is missing or too short. Generate with: openssl rand -base64 32"
    );
  }
  return scryptSync(raw, SALT, KEY_LENGTH);
}

export interface EncryptedSecret {
  ciphertext: string;
  iv: string;
  authTag: string;
  keyVersion: number;
}

export function encryptWalletSecret(plaintext: string, keyVersion = 1): EncryptedSecret {
  if (!plaintext || plaintext.length < 8) {
    throw new Error("Invalid secret material");
  }
  const key = getEncryptionKey();
  const iv = randomBytes(IV_LENGTH);
  const cipher = createCipheriv(ALGORITHM, key, iv);
  const encrypted = Buffer.concat([
    cipher.update(plaintext, "utf8"),
    cipher.final(),
  ]);
  const authTag = cipher.getAuthTag();

  return {
    ciphertext: encrypted.toString("base64"),
    iv: iv.toString("base64"),
    authTag: authTag.toString("base64"),
    keyVersion,
  };
}

export function decryptWalletSecret(encrypted: EncryptedSecret): string {
  const key = getEncryptionKey();
  const iv = Buffer.from(encrypted.iv, "base64");
  const authTag = Buffer.from(encrypted.authTag, "base64");
  const ciphertext = Buffer.from(encrypted.ciphertext, "base64");

  const decipher = createDecipheriv(ALGORITHM, key, iv);
  decipher.setAuthTag(authTag);
  const decrypted = Buffer.concat([
    decipher.update(ciphertext),
    decipher.final(),
  ]);
  return decrypted.toString("utf8");
}

export function redactSecrets(input: string): string {
  return input
    .replace(/[1-9A-HJ-NP-Za-km-z]{32,88}/g, "[REDACTED_KEY]")
    .replace(/\b(seed|mnemonic|private|secret)[^\s]{0,20}/gi, "[REDACTED]");
}
