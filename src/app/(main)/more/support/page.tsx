"use client";

import Link from "next/link";
import { BottomNav } from "@/components/layout/bottom-nav";

const faqs = [
  {
    q: "Will support ever ask for my private key?",
    a: "No. PUMP AUTO will never ask for your private key or seed phrase through support or any other channel.",
  },
  {
    q: "Why was my trade blocked?",
    a: "The risk engine rejected it — daily loss cap, max exposure, position limit, cooldown, or emergency stop. Check the activity feed for the exact reason. No transaction was submitted.",
  },
  {
    q: "Submitted but no position?",
    a: "Only confirmed transactions open positions. Submitted can still fail or timeout. Check the order state and on-chain signature.",
  },
  {
    q: "How are developer scores calculated?",
    a: "From verified launches, graduation, abandonment, survival, and peak multiples. Confidence depends on sample size. We do not invent success rates.",
  },
];

export default function SupportPage() {
  return (
    <main className="min-h-dvh flex flex-col pb-20">
      <header className="px-5 pt-6 pb-4 border-b border-[var(--card-border)]">
        <Link href="/more" className="text-xs text-[var(--muted)]">
          ← More
        </Link>
        <h1 className="text-lg font-bold text-white mt-1">Support</h1>
      </header>

      <div className="flex-1 px-5 py-5 max-w-lg mx-auto w-full space-y-6">
        <div className="rounded-xl border border-[var(--warning)]/40 bg-[var(--warning)]/10 px-4 py-3 text-xs text-[var(--warning)]">
          PUMP AUTO will never ask for your private key or seed phrase through support.
        </div>

        <section className="space-y-2">
          <h2 className="text-sm font-semibold text-white">FAQ</h2>
          {faqs.map((f) => (
            <details
              key={f.q}
              className="rounded-xl border border-[var(--card-border)] bg-[var(--card)]"
            >
              <summary className="px-4 py-3 text-sm text-white cursor-pointer">
                {f.q}
              </summary>
              <p className="px-4 pb-3 text-xs text-[var(--muted)] leading-relaxed">{f.a}</p>
            </details>
          ))}
        </section>

        <section className="rounded-xl border border-[var(--card-border)] bg-[var(--card)] p-4 space-y-2">
          <h2 className="text-sm font-semibold text-white">Contact</h2>
          <p className="text-xs text-[var(--muted)]">
            For trading or transaction issues, include the transaction signature when safe. Never
            send private keys.
          </p>
          <p className="text-xs text-[var(--muted)]">
            Support channels will be configured in production (email / ticket system).
          </p>
        </section>
      </div>

      <BottomNav />
    </main>
  );
}
