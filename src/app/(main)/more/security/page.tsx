"use client";

import { useState } from "react";
import Link from "next/link";
import { BottomNav } from "@/components/layout/bottom-nav";
import { Button } from "@/components/ui/button";

export default function SecurityPage() {
  const [emergency, setEmergency] = useState(false);
  const [loading, setLoading] = useState(false);

  const toggleEmergency = async (activate: boolean) => {
    setLoading(true);
    try {
      const res = await fetch("/api/hunter", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: activate ? "emergency_stop" : "clear_emergency",
        }),
      });
      const data = await res.json();
      if (res.ok) {
        setEmergency(!!data.emergencyStop);
      }
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
        <h1 className="text-lg font-bold text-white mt-1">Security</h1>
      </header>

      <div className="flex-1 px-5 py-5 max-w-lg mx-auto w-full space-y-6">
        <section className="rounded-xl border border-[var(--card-border)] bg-[var(--card)] p-4 space-y-2">
          <h2 className="text-sm font-semibold text-white">Wallet encryption</h2>
          <p className="text-xs text-[var(--muted)] leading-relaxed">
            Private keys are encrypted at rest with AES-256-GCM using an environment-managed key.
            They never appear in logs, analytics, or API responses.
          </p>
        </section>

        <section className="rounded-xl border border-[var(--danger)]/40 bg-[var(--card)] p-4 space-y-3">
          <h2 className="text-sm font-semibold text-white">Emergency Stop</h2>
          <p className="text-xs text-[var(--muted)] leading-relaxed">
            Immediately blocks new Auto-Hunter and Smart Dev Follow entries. Does{" "}
            <strong className="text-white">not</strong> sell positions, withdraw funds, or delete
            wallets.
          </p>
          {!emergency ? (
            <Button
              size="lg"
              variant="danger"
              disabled={loading}
              onClick={() => {
                if (confirm("Activate Emergency Stop?")) toggleEmergency(true);
              }}
            >
              ACTIVATE EMERGENCY STOP
            </Button>
          ) : (
            <Button
              size="lg"
              variant="secondary"
              disabled={loading}
              onClick={() => toggleEmergency(false)}
            >
              Clear Emergency Stop
            </Button>
          )}
        </section>

        <section className="rounded-xl border border-[var(--card-border)] bg-[var(--card)] p-4">
          <h2 className="text-sm font-semibold text-white mb-2">Support warning</h2>
          <p className="text-xs text-[var(--warning)] leading-relaxed">
            PUMP AUTO will never ask for your private key or seed phrase through support.
          </p>
        </section>
      </div>

      <BottomNav />
    </main>
  );
}
