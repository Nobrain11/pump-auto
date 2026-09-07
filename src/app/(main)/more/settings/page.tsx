"use client";

import { useState } from "react";
import Link from "next/link";
import { BottomNav } from "@/components/layout/bottom-nav";
import { Button } from "@/components/ui/button";

export default function SettingsPage() {
  const [tradeSize, setTradeSize] = useState("0.25");
  const [slippage, setSlippage] = useState("300");
  const [maxPositions, setMaxPositions] = useState("5");
  const [dailyLoss, setDailyLoss] = useState("1.0");
  const [minScore, setMinScore] = useState("70");
  const [minLiq, setMinLiq] = useState("10000");
  const [saved, setSaved] = useState(false);

  const save = () => {
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  };

  return (
    <main className="min-h-dvh flex flex-col pb-20">
      <header className="px-5 pt-6 pb-4 border-b border-[var(--card-border)]">
        <Link href="/more" className="text-xs text-[var(--muted)]">
          ← More
        </Link>
        <h1 className="text-lg font-bold text-white mt-1">Settings</h1>
      </header>

      <div className="flex-1 px-5 py-5 max-w-lg mx-auto w-full space-y-6">
        <section className="space-y-4">
          <h2 className="text-xs font-mono tracking-widest text-[var(--muted)] uppercase">
            Trading
          </h2>
          <Field label="Default trade size (SOL)" value={tradeSize} onChange={setTradeSize} />
          <Field label="Slippage (bps)" value={slippage} onChange={setSlippage} />
          <Field label="Max concurrent positions" value={maxPositions} onChange={setMaxPositions} />
          <Field label="Daily loss limit (SOL)" value={dailyLoss} onChange={setDailyLoss} />
        </section>

        <section className="space-y-4">
          <h2 className="text-xs font-mono tracking-widest text-[var(--muted)] uppercase">
            Auto-Hunter
          </h2>
          <Field label="Minimum token score" value={minScore} onChange={setMinScore} />
          <Field label="Minimum liquidity (USD)" value={minLiq} onChange={setMinLiq} />
        </section>

        <Button size="lg" onClick={save}>
          {saved ? "Saved" : "Save Settings"}
        </Button>
        <p className="text-[10px] text-[var(--muted)] text-center">
          Settings apply to new automated entries. Risk engine still enforces hard caps.
        </p>
      </div>

      <BottomNav />
    </main>
  );
}

function Field({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <label className="block">
      <span className="text-xs text-[var(--muted)]">{label}</span>
      <input
        type="text"
        inputMode="decimal"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="mt-1 w-full h-11 rounded-xl border border-[var(--card-border)] bg-[var(--card)] px-4 text-sm text-white font-mono focus:outline-none focus:ring-1 focus:ring-[var(--primary)]"
      />
    </label>
  );
}
