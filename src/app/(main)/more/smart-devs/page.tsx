"use client";

import { useEffect, useState, useCallback } from "react";
import Link from "next/link";
import { BottomNav } from "@/components/layout/bottom-nav";
import { Button } from "@/components/ui/button";

interface FollowRow {
  id: string;
  developerAddress: string;
  score: number | null;
  confidence: string;
  tradeAmountSol: number;
  minDevScore: number;
  maxPositions: number;
  autoBuy: boolean;
  alertsEnabled: boolean;
}

export default function SmartDevsPage() {
  const [follows, setFollows] = useState<FollowRow[]>([]);
  const [address, setAddress] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/developers/follow");
      const data = await res.json();
      setFollows(data.follows || []);
      setNote(data.note || null);
    } catch {
      setError("Failed to load follows");
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const follow = async () => {
    if (address.length < 32) {
      setError("Enter a valid developer address");
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/developers/follow", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          developerAddress: address.trim(),
          tradeAmountSol: 0.25,
          minDevScore: 70,
          autoBuy: false,
          alertsEnabled: true,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Follow failed");
      setAddress("");
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Follow failed");
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
        <h1 className="text-lg font-bold text-white mt-1">Smart Devs</h1>
        <p className="text-xs text-[var(--muted)] mt-1">
          Follow verified developers. Auto-buy still passes the risk engine.
        </p>
      </header>

      <div className="flex-1 px-5 py-5 max-w-lg mx-auto w-full space-y-5">
        {error && (
          <div className="rounded-xl border border-[var(--danger)]/40 bg-[var(--danger)]/10 px-4 py-3 text-sm text-[var(--danger)]">
            {error}
          </div>
        )}
        {note && <p className="text-[10px] text-[var(--muted)]">{note}</p>}

        <div className="space-y-2">
          <label className="block">
            <span className="text-xs text-[var(--muted)]">Developer address</span>
            <input
              value={address}
              onChange={(e) => setAddress(e.target.value)}
              placeholder="Solana pubkey…"
              className="mt-1 w-full h-11 rounded-xl border border-[var(--card-border)] bg-[var(--card)] px-4 text-sm text-white font-mono focus:outline-none focus:ring-1 focus:ring-[var(--primary)]"
            />
          </label>
          <Button size="lg" onClick={follow} disabled={loading}>
            {loading ? "…" : "Follow Developer"}
          </Button>
        </div>

        <section className="space-y-2">
          <h2 className="text-xs font-mono tracking-widest text-[var(--muted)] uppercase">
            Following ({follows.length})
          </h2>
          {follows.length === 0 && (
            <div className="rounded-xl border border-[var(--card-border)] bg-[var(--card)] p-6 text-center text-sm text-[var(--muted)]">
              No follows yet. Scores require verified launch history — never invented.
            </div>
          )}
          {follows.map((f) => (
            <div
              key={f.id}
              className="rounded-xl border border-[var(--card-border)] bg-[var(--card)] p-4"
            >
              <p className="text-sm font-mono text-white truncate">{f.developerAddress}</p>
              <div className="mt-2 flex flex-wrap gap-3 text-[10px] font-mono text-[var(--muted)]">
                <span>Score: {f.score ?? "—"}</span>
                <span>Conf: {f.confidence}</span>
                <span>Size: {f.tradeAmountSol} SOL</span>
                <span>Auto: {f.autoBuy ? "ON" : "OFF"}</span>
              </div>
            </div>
          ))}
        </section>
      </div>

      <BottomNav />
    </main>
  );
}
