"use client";

import { useEffect, useState, useCallback } from "react";
import Link from "next/link";
import { BottomNav } from "@/components/layout/bottom-nav";
import { Button } from "@/components/ui/button";

interface WalletView {
  id: string;
  name: string;
  publicKey: string;
  isPrimary: boolean;
  balanceSol?: number | null;
}

export default function HomePage() {
  const [wallets, setWallets] = useState<WalletView[]>([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/wallets");
      const data = await res.json();
      if (res.ok) setWallets(data.wallets || []);
      else setError(data.error || "Could not load wallets");
    } catch {
      setError("Network error loading wallets");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const createWallet = async () => {
    setCreating(true);
    setError(null);
    try {
      const res = await fetch("/api/wallets", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: "Main" }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Create failed");
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Create failed");
    } finally {
      setCreating(false);
    }
  };

  const primary = wallets.find((w) => w.isPrimary) || wallets[0];
  const balance = primary?.balanceSol;
  const funded = balance != null && balance > 0.01;
  const hasWallet = wallets.length > 0;

  return (
    <main className="min-h-dvh flex flex-col pb-20">
      <header className="px-5 pt-8 pb-4">
        <p className="text-[10px] font-mono tracking-[0.2em] text-[var(--primary)] uppercase">
          PUMP AUTO
        </p>
        <h1 className="text-2xl font-bold text-white mt-1">Solana Trading Terminal</h1>
        <p className="text-sm text-[var(--muted)] mt-2">
          Fund → Hunt → Filter → Enter → Watch → Exit → Learn → Repeat
        </p>
      </header>

      <div className="flex-1 px-5 py-4 max-w-lg mx-auto w-full space-y-6">
        {error && (
          <div className="rounded-xl border border-[var(--danger)]/40 bg-[var(--danger)]/10 px-4 py-3 text-sm text-[var(--danger)]">
            {error}
          </div>
        )}

        {/* Step 1: Wallet */}
        <section className="rounded-2xl border border-[var(--card-border)] bg-[var(--card)] p-5 space-y-4">
          <div className="flex items-center gap-2">
            <span className="w-6 h-6 rounded-full bg-[var(--primary)]/20 text-[var(--primary)] text-xs font-bold flex items-center justify-center">
              1
            </span>
            <h2 className="text-sm font-semibold text-white">Fund your wallet</h2>
          </div>

          {loading && <p className="text-xs text-[var(--muted)]">Loading…</p>}

          {!loading && !hasWallet && (
            <>
              <p className="text-xs text-[var(--muted)] leading-relaxed">
                Create an encrypted trading wallet. Private keys never leave the server encrypted store.
              </p>
              <Button size="lg" onClick={createWallet} disabled={creating}>
                {creating ? "Creating…" : "Create Wallet"}
              </Button>
            </>
          )}

          {hasWallet && primary && (
            <div className="space-y-2">
              <p className="text-xs text-[var(--muted)]">{primary.name}</p>
              <p className="text-[10px] font-mono text-[var(--muted)] break-all">{primary.publicKey}</p>
              <p className="text-2xl font-mono font-bold text-white">
                {balance != null ? balance.toFixed(4) : "—"}{" "}
                <span className="text-sm text-[var(--muted)]">SOL</span>
              </p>
              {!funded && (
                <p className="text-xs text-[var(--warning)]">
                  Send SOL to this address to fund. Balances are live from RPC — never simulated.
                </p>
              )}
            </div>
          )}
        </section>

        {/* Step 2: Strategy */}
        <section className="rounded-2xl border border-[var(--card-border)] bg-[var(--card)] p-5 space-y-3">
          <div className="flex items-center gap-2">
            <span className="w-6 h-6 rounded-full bg-[var(--primary)]/20 text-[var(--primary)] text-xs font-bold flex items-center justify-center">
              2
            </span>
            <h2 className="text-sm font-semibold text-white">Choose your strategy</h2>
          </div>
          <Link
            href="/terminal"
            className="block rounded-xl border border-[var(--card-border)] px-4 py-3 hover:border-[var(--primary)]/40 transition-colors"
          >
            <p className="text-sm font-medium text-white">Auto-Hunter</p>
            <p className="text-xs text-[var(--muted)]">Scan, filter, enter, monitor automatically</p>
          </Link>
          <Link
            href="/more/smart-devs"
            className="block rounded-xl border border-[var(--card-border)] px-4 py-3 hover:border-[var(--primary)]/40 transition-colors"
          >
            <p className="text-sm font-medium text-white">Smart Dev Follow</p>
            <p className="text-xs text-[var(--muted)]">Track proven developers with risk gates</p>
          </Link>
        </section>

        {/* Primary CTA */}
        <div className="space-y-2">
          {!hasWallet ? (
            <Button size="lg" onClick={createWallet} disabled={creating}>
              {creating ? "Creating…" : "Create Wallet"}
            </Button>
          ) : !funded ? (
            <Button size="lg" variant="secondary" disabled>
              FUND WALLET
            </Button>
          ) : (
            <Link href="/terminal" className="block">
              <Button size="lg">START TRADING</Button>
            </Link>
          )}
          <p className="text-[10px] text-center text-[var(--muted)]">
            Risk engine is mandatory. No silent mock data in production.
          </p>
        </div>
      </div>

      <BottomNav />
    </main>
  );
}
