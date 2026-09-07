/**
 * SolanaProvider — abstraction over RPC / WebSocket.
 * Production implementations should use dedicated RPC (Helius, Triton, QuickNode).
 * Failures must surface; never fall back to fabricated balances.
 */

import {
  Connection,
  PublicKey,
  ParsedAccountData,
  Commitment,
} from "@solana/web3.js";
import type { SolanaProvider } from "@/types";

export class RpcSolanaProvider implements SolanaProvider {
  private connection: Connection;

  constructor(rpcUrl?: string, commitment: Commitment = "confirmed") {
    const url = rpcUrl || process.env.SOLANA_RPC_URL;
    if (!url) {
      throw new Error("SOLANA_RPC_URL is required");
    }
    this.connection = new Connection(url, commitment);
  }

  async getBalance(publicKey: string): Promise<number> {
    const pk = new PublicKey(publicKey);
    const lamports = await this.connection.getBalance(pk);
    return lamports / 1e9;
  }

  async getTokenAccounts(
    publicKey: string
  ): Promise<{ mint: string; amount: string; uiAmount: number }[]> {
    const pk = new PublicKey(publicKey);
    const response = await this.connection.getParsedTokenAccountsByOwner(pk, {
      programId: new PublicKey("TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA"),
    });

    return response.value.map((item) => {
      const data = item.account.data as ParsedAccountData;
      const info = data.parsed.info;
      return {
        mint: info.mint as string,
        amount: info.tokenAmount.amount as string,
        uiAmount: info.tokenAmount.uiAmount ?? 0,
      };
    });
  }

  async getTransaction(signature: string): Promise<unknown | null> {
    return this.connection.getParsedTransaction(signature, {
      maxSupportedTransactionVersion: 0,
    });
  }

  async sendRawTransaction(rawTx: Buffer | Uint8Array): Promise<string> {
    return this.connection.sendRawTransaction(rawTx, {
      skipPreflight: false,
      preflightCommitment: "confirmed",
      maxRetries: 3,
    });
  }

  async confirmTransaction(
    signature: string,
    commitment: "processed" | "confirmed" | "finalized" = "confirmed"
  ): Promise<boolean> {
    const result = await this.connection.confirmTransaction(signature, commitment);
    return !result.value.err;
  }

  getConnection(): Connection {
    return this.connection;
  }
}

export function createSolanaProvider(): SolanaProvider {
  if (process.env.NEXT_PUBLIC_DEMO_MODE === "true") {
    throw new Error(
      "Demo mode is disabled for SolanaProvider. Real RPC required in production."
    );
  }
  return new RpcSolanaProvider();
}
