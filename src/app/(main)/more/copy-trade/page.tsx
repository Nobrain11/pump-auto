"use client";

import Link from "next/link";
import { FormEvent, useState } from "react";
import { AlertTriangle, ArrowLeft, Copy, ShieldCheck } from "lucide-react";
import { BottomNav } from "@/components/layout/bottom-nav";
import { Button } from "@/components/ui/button";

export default function CopyTradePage() {
  const [mode, setMode] = useState<"fixed" | "percent">("fixed");
  const [amount, setAmount] = useState("");
  const [maxPositions, setMaxPositions] = useState("3");
  const [risk, setRisk] = useState("LOW");
  const [message, setMessage] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const params = typeof window !== "undefined" ? new URLSearchParams(window.location.search) : null;
  const trader = params?.get("trader");

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (!amount || Number(amount) <= 0) { setMessage("Enter a positive amount before continuing."); return; }
    setSaving(true); setMessage(null);
    try {
      const response = await fetch("/api/copy-trade", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ traderId: trader, mode, amount: Number(amount), maxPositions: Number(maxPositions), risk }) });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Copy trading is unavailable.");
      setMessage("Copy configuration saved.");
    } catch (error) { setMessage(error instanceof Error ? error.message : "Copy trading is unavailable."); }
    finally { setSaving(false); }
  }

  return <main className="min-h-dvh bg-background pb-24 text-foreground lg:pb-8"><header className="border-b border-card-border bg-card/70"><div className="mx-auto max-w-3xl px-4 py-5 sm:px-6"><Link href="/more/leaderboard" className="flex items-center gap-2 font-mono text-[10px] uppercase tracking-[0.2em] text-muted"><ArrowLeft className="size-3" />Back to leaderboard</Link><div className="mt-5 flex items-end justify-between gap-4"><div><p className="flex items-center gap-2 text-xs text-primary"><Copy className="size-4" />Controlled automation</p><h1 className="mt-2 text-3xl font-semibold">Copy trader</h1><p className="mt-2 text-sm leading-6 text-muted">Configure limits first. Every copied entry still passes the shared risk engine.</p></div><ShieldCheck className="hidden size-7 text-primary sm:block" /></div></div></header><div className="mx-auto max-w-3xl px-4 py-5 sm:px-6"><form onSubmit={submit} className="flex flex-col gap-5 rounded-xl border border-card-border bg-card p-5"><div className="rounded-lg border border-primary/20 bg-primary/5 p-4 text-sm leading-6 text-muted">{trader ? `Trader ${trader} selected. Verified performance and current positions will be checked server-side before activation.` : "Select a verified trader from the leaderboard to prefill this configuration."}</div><fieldset className="flex flex-col gap-3"><legend className="text-sm font-medium">Copy amount</legend><div className="flex gap-2">{([ ["fixed", "Fixed SOL"], ["percent", "Wallet %"] ] as const).map(([value, label]) => <button key={value} type="button" onClick={() => setMode(value)} className={`rounded-lg border px-4 py-2 text-sm ${mode === value ? "border-primary bg-primary/10 text-primary" : "border-card-border text-muted"}`}>{label}</button>)}</div><label className="flex flex-col gap-2 text-xs text-muted"><span>{mode === "fixed" ? "SOL per entry" : "Percent of wallet per entry"}</span><input value={amount} onChange={(event) => setAmount(event.target.value)} inputMode="decimal" placeholder={mode === "fixed" ? "0.25" : "5"} className="rounded-lg border border-card-border bg-background px-3 py-3 font-mono text-sm text-foreground outline-none focus:border-primary" /></label></fieldset><label className="flex flex-col gap-2 text-xs text-muted"><span>Maximum copied positions</span><input value={maxPositions} onChange={(event) => setMaxPositions(event.target.value)} type="number" min="1" max="20" className="rounded-lg border border-card-border bg-background px-3 py-3 font-mono text-sm text-foreground outline-none focus:border-primary" /></label><fieldset className="flex flex-col gap-3"><legend className="text-sm font-medium">Risk ceiling</legend><div className="flex flex-wrap gap-2">{["LOW", "MEDIUM", "HIGH"].map((value) => <button key={value} type="button" onClick={() => setRisk(value)} className={`rounded-full border px-3 py-1.5 font-mono text-[10px] ${risk === value ? "border-primary text-primary" : "border-card-border text-muted"}`}>{value}</button>)}</div></fieldset><div className="flex items-start gap-3 border-t border-card-border pt-4 text-xs leading-5 text-muted"><AlertTriangle className="mt-0.5 size-4 shrink-0 text-accent" />Copying does not guarantee profit. The risk engine may reject entries, and emergency stop blocks new automated entries without selling existing positions.</div>{message && <p role="status" className="rounded-lg border border-card-border bg-background px-3 py-3 text-sm text-muted">{message}</p>}<Button type="submit" disabled={saving || !trader}>{saving ? "Saving…" : "Save copy configuration"}</Button></form></div><BottomNav /></main>;
}
