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

export default function WalletsPage() {
  const [wallets, setWallets] = useState<WalletView[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/wallets");
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed");
      setWallets(data.wallets || []);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const create = async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/wallets", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: `Wallet ${wallets.length + 1}` }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Create failed");
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Create failed");
    } finally {
      setLoading(false);
    }
  };

  return (
    <main className="min-h-dvh flex flex-col pb-20">
      <header className="px-5 pt-6 pb-4 border-b border-[var(--card-border)]">
        <Link href="/more" className="text-xs text-[var(--muted)]">
          ← More
        </Link>
        <h1 className="text-lg font-bold text-white mt-1">Wallets</h1>
      </header>

      <div className="flex-1 px-5 py-5 max-w-lg mx-auto w-full space-y-4">
        {error && (
          <div className="rounded-xl border border-[var(--danger)]/40 bg-[var(--danger)]/10 px-4 py-3 text-sm text-[var(--danger)]">
            {error}
          </div>
        )}

        {wallets.map((w) => (
          <div key={w.id} className="rounded-xl border border-[var(--card-border)] bg-[var(--card)] p-4">
            <div className="flex justify-between items-start">
              <div>
                <p className="text-sm font-semibold text-white">
                  {w.name}
                  {w.isPrimary && (
                    <span className="ml-2 text-[10px] text-[var(--primary)]">PRIMARY</span>
                  )}
                </p>
                <p className="text-[10px] font-mono text-[var(--muted)] truncate mt-1 max-w-[240px]">
                  {w.publicKey}
                </p>
              </div>
              <p className="text-lg font-mono font-semibold text-white">
                {w.balanceSol != null ? w.balanceSol.toFixed(4) : "—"}{" "}
                <span className="text-xs text-[var(--muted)]">SOL</span>
              </p>
            </div>
          </div>
        ))}

        {wallets.length === 0 && !loading && (
          <div className="rounded-xl border border-[var(--card-border)] bg-[var(--card)] p-6 text-center text-sm text-[var(--muted)]">
            No wallets yet. Create one to begin.
          </div>
        )}

        <Button size="lg" onClick={create} disabled={loading}>
          {loading ? "…" : "+ Add Wallet"}
        </Button>
      </div>

      <BottomNav />
    </main>
  );
}
