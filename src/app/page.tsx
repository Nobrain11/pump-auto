"use client";

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { BottomNav } from "@/components/layout/bottom-nav";
import { Brand } from "@/components/layout/brand";

type OnboardingStep = "intro" | "terms" | "wallet" | "ready" | "dashboard";

interface WalletView {
  id: string;
  name: string;
  publicKey: string;
  isPrimary: boolean;
  balanceSol?: number | null;
}

interface HunterStatus {
  state?: string;
  opportunitiesFound?: number;
  passedFilters?: number;
  positions?: number;
  entriesToday?: number;
  dailyRiskUsedPct?: number;
  marketRegime?: string;
  emergencyStop?: boolean;
}

interface ActivityRow {
  id: string;
  type: string;
  message: string;
  severity: string;
  createdAt: string;
}

interface PortfolioData {
  totalSol?: number;
  realizedPnlSol?: number;
  unrealizedPnlSol?: number;
  exposureSol?: number;
  positionCount?: number;
}

export default function HomePage() {
  const [step, setStep] = useState<OnboardingStep>("intro");
  const [termsAccepted, setTermsAccepted] = useState(false);
  const [wallets, setWallets] = useState<WalletView[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [importKey, setImportKey] = useState("");
  const [showImport, setShowImport] = useState(false);
  const [hunter, setHunter] = useState<HunterStatus | null>(null);
  const [activity, setActivity] = useState<ActivityRow[]>([]);
  const [portfolio, setPortfolio] = useState<PortfolioData | null>(null);
  const [health, setHealth] = useState<{ ok?: boolean } | null>(null);

  const fetchWallets = useCallback(async () => {
    try {
      const res = await fetch("/api/wallets");
      if (res.ok) {
        const data = await res.json();
        setWallets(data.wallets || []);
        if (data.wallets?.length > 0) setStep("dashboard");
      }
    } catch {
      /* first load */
    }
  }, []);

  const refreshDashboard = useCallback(async () => {
    try {
      const [h, a, p, hl] = await Promise.all([
        fetch("/api/hunter").then((r) => r.json()).catch(() => null),
        fetch("/api/activity").then((r) => r.json()).catch(() => ({ events: [] })),
        fetch("/api/portfolio").then((r) => r.json()).catch(() => null),
        fetch("/api/health").then((r) => r.json()).catch(() => null),
      ]);
      setHunter(h);
      setActivity((a?.events || a?.activity || []).slice(0, 8));
      setPortfolio(p);
      setHealth(hl);
    } catch {
      /* keep last */
    }
  }, []);

  useEffect(() => {
    fetchWallets();
  }, [fetchWallets]);

  useEffect(() => {
    if (step !== "dashboard") return;
    refreshDashboard();
    const t = setInterval(refreshDashboard, 8000);
    return () => clearInterval(t);
  }, [step, refreshDashboard]);

  const createWallet = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/wallets", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: "Main" }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to create wallet");
      await fetchWallets();
      setStep("ready");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Create failed");
    } finally {
      setLoading(false);
    }
  };

  const importWallet = async () => {
    if (!importKey.trim()) {
      setError("Paste a private key");
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/wallets/import", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ privateKey: importKey.trim(), name: "Imported" }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Import failed");
      setImportKey("");
      setShowImport(false);
      await fetchWallets();
      setStep("ready");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Import failed");
    } finally {
      setLoading(false);
    }
  };

  const primary = wallets.find((w) => w.isPrimary) || wallets[0];
  const balance = primary?.balanceSol;
  const funded = balance != null && balance > 0.01;
  const hunterState = hunter?.state || "OFF";
  const isLive = !["OFF", "PAUSED", "RISK_HALTED", "ERROR"].includes(hunterState);
  const totalPnl =
    (portfolio?.realizedPnlSol || 0) + (portfolio?.unrealizedPnlSol || 0);

  if (step === "intro") {
    return (
      <main className="min-h-dvh flex flex-col pb-16">
        <div className="flex-1 flex flex-col justify-center px-5 max-w-md mx-auto w-full space-y-8">
          <Brand />
          <div className="space-y-2">
            <h1 className="text-xl font-semibold text-white tracking-tight">
              Autonomous Solana command center
            </h1>
            <p className="text-sm text-[var(--muted)] leading-relaxed">
              Observe → Filter → Enter → Monitor → Exit. A signal-first execution layer with hard risk controls. Live balances and confirmed transactions only.
            </p>
          </div>
          <div className="panel p-3 space-y-2 text-[11px] mono text-[var(--muted)]">
            <p className="flex justify-between"><span>Risk engine</span><span className="text-[var(--success)]">MANDATORY</span></p>
            <p className="flex justify-between"><span>Mock data</span><span className="text-[var(--danger)]">DISABLED</span></p>
            <p className="flex justify-between"><span>Keys</span><span className="text-white">AES-256-GCM</span></p>
          </div>
          <Button size="lg" onClick={() => setStep("terms")}>
            Continue
          </Button>
        </div>
        <BottomNav />
      </main>
    );
  }

  if (step === "terms") {
    return (
      <main className="min-h-dvh flex flex-col pb-16">
        <div className="flex-1 px-5 py-8 max-w-md mx-auto w-full space-y-5">
          <Brand />
          <h1 className="text-lg font-semibold text-white">Before you trade</h1>
          <div className="panel p-4 text-xs text-[var(--muted)] space-y-2 leading-relaxed">
            <p>Automated trading involves substantial risk of loss. Past scores do not guarantee future results.</p>
            <p>PUMP AUTO does not custody funds beyond encrypted key storage you control. You are responsible for risk limits and funding.</p>
            <p>Emergency Stop blocks new entries only — it does not liquidate positions.</p>
          </div>
          <label className="flex items-start gap-2 text-xs text-[var(--foreground)]">
            <input
              type="checkbox"
              checked={termsAccepted}
              onChange={(e) => setTermsAccepted(e.target.checked)}
              className="mt-0.5"
            />
            I understand the risks and that no returns are guaranteed.
          </label>
          <Button size="lg" disabled={!termsAccepted} onClick={() => setStep("wallet")}>
            Continue
          </Button>
        </div>
        <BottomNav />
      </main>
    );
  }

  if (step === "wallet") {
    return (
      <main className="min-h-dvh flex flex-col pb-16">
        <div className="flex-1 px-5 py-8 max-w-md mx-auto w-full space-y-5">
          <Brand />
          <div>
            <p className="label">Step 1</p>
            <h1 className="text-lg font-semibold text-white">Create or import wallet</h1>
            <p className="text-xs text-[var(--muted)] mt-1">
              Private keys are encrypted server-side. Never returned in API responses.
            </p>
          </div>
          {error && (
            <div className="panel px-3 py-2 text-xs text-[var(--danger)] border-[var(--danger)]/30">{error}</div>
          )}
          <Button size="lg" onClick={createWallet} disabled={loading}>
            {loading ? "Working…" : "Create wallet"}
          </Button>
          <button type="button" className="text-xs text-[var(--muted)] underline" onClick={() => setShowImport((v) => !v)}>
            Import existing key
          </button>
          {showImport && (
            <div className="space-y-2">
              <textarea
                value={importKey}
                onChange={(e) => setImportKey(e.target.value)}
                placeholder="Base58 private key"
                className="w-full h-24 panel px-3 py-2 text-xs mono text-white bg-[var(--card)] border border-[var(--card-border)] rounded-[var(--radius)]"
              />
              <Button size="md" variant="secondary" onClick={importWallet} disabled={loading}>
                Import
              </Button>
            </div>
          )}
        </div>
        <BottomNav />
      </main>
    );
  }

  if (step === "ready") {
    return (
      <main className="min-h-dvh flex flex-col pb-16">
        <div className="flex-1 px-5 py-8 max-w-md mx-auto w-full space-y-5">
          <Brand />
          <div className="panel p-4 space-y-2">
            <p className="label">Wallet ready</p>
            <p className="text-xs mono text-[var(--muted)] break-all">{primary?.publicKey}</p>
            <p className="text-2xl mono font-semibold text-white">
              {(balance ?? 0).toFixed(4)} <span className="text-sm text-[var(--muted)]">SOL</span>
            </p>
            {!funded && (
              <p className="text-[11px] text-[var(--warning)]">
                Fund this address on Solana mainnet. Balances are live from RPC.
              </p>
            )}
          </div>
          <Button size="lg" onClick={() => setStep("dashboard")}>
            Open terminal
          </Button>
        </div>
        <BottomNav />
      </main>
    );
  }

  return (
    <main className="min-h-dvh flex flex-col pb-16">
      <header className="px-4 pt-4 pb-3 border-b border-[var(--card-border)] flex items-center justify-between gap-3">
        <Brand />
        <div className="flex items-center gap-2 text-[10px] mono">
          <span className={health?.ok !== false ? "dot dot-live pulse-dot" : "dot dot-danger"} />
          <span className="text-[var(--muted)]">{health?.ok === false ? "DEGRADED" : "SYSTEM"}</span>
        </div>
      </header>

      <div className="flex-1 px-4 py-4 max-w-5xl mx-auto w-full space-y-4 lg:grid lg:grid-cols-[1.15fr_0.85fr] lg:items-start lg:gap-4 lg:space-y-0">
        <section className="panel p-4 lg:col-span-2">
          <div className="flex justify-between items-start">
            <div>
              <p className="label">Capital overview</p>
              <p className="text-2xl mono font-semibold text-white leading-tight">
                {(typeof balance === "number" ? balance : portfolio?.totalSol ?? 0).toFixed(4)}{" "}
                <span className="text-xs text-[var(--muted)]">SOL</span>
              </p>
            </div>
            <div className="text-right">
              <p className="label">PnL</p>
              <p className={`text-sm mono font-semibold ${totalPnl >= 0 ? "text-up" : "text-down"}`}>
                {totalPnl >= 0 ? "+" : ""}{totalPnl.toFixed(4)}
              </p>
            </div>
          </div>
          <div className="grid grid-cols-3 gap-2 mt-3 pt-3 border-t border-[var(--border-subtle)]">
            {[
              ["Positions", portfolio?.positionCount ?? 0],
              ["Exposure", (portfolio?.exposureSol ?? 0).toFixed(2)],
              ["Risk used", `${hunter?.dailyRiskUsedPct ?? 0}%`],
            ].map(([k, v]) => (
              <div key={String(k)} className="text-center">
                <p className="text-sm mono text-white">{v}</p>
                <p className="label mt-0.5">{k}</p>
              </div>
            ))}
          </div>
        </section>

        <section className="panel p-3 space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className={isLive ? "dot dot-live pulse-dot" : "dot dot-off"} />
              <h2 className="text-xs font-semibold text-white tracking-wide">SIGNAL ENGINE</h2>
            </div>
            <span className="text-[10px] mono text-[var(--muted)]">{hunterState}</span>
          </div>
          <div className="grid grid-cols-4 gap-1.5 text-center">
            {[
              ["Found", hunter?.opportunitiesFound ?? 0],
              ["Passed", hunter?.passedFilters ?? 0],
              ["Pos", hunter?.positions ?? 0],
              ["Today", hunter?.entriesToday ?? 0],
            ].map(([k, v]) => (
              <div key={String(k)} className="rounded bg-black/30 py-1.5">
                <p className="text-sm mono text-white">{v}</p>
                <p className="label">{k}</p>
              </div>
            ))}
          </div>
          <p className="text-[10px] mono text-[var(--muted)]">
            Regime {hunter?.marketRegime || "—"}
            {hunter?.emergencyStop ? " · EMERGENCY STOP" : ""}
          </p>
          <Link href="/terminal" className="block">
            <Button size="lg">{isLive ? "Open terminal" : "Start trading"}</Button>
          </Link>
        </section>

        <div className="grid grid-cols-2 gap-2">
          <Link href="/hunt"><Button variant="secondary" size="md" className="w-full">Hunt</Button></Link>
          <Link href="/more/smart-devs"><Button variant="secondary" size="md" className="w-full">Smart Devs</Button></Link>
        </div>

        <section className="panel overflow-hidden lg:col-start-2 lg:row-start-2">
          <div className="panel-header flex justify-between items-center">
            <span>Signal log</span>
            <Link href="/more/activity" className="text-[var(--primary)] normal-case tracking-normal">All</Link>
          </div>
          <div className="divide-y divide-[var(--border-subtle)] max-h-48 overflow-y-auto">
            {activity.length === 0 && (
              <p className="px-3 py-4 text-[11px] text-[var(--muted)] text-center">
                No events yet. Live feed appears after scanner and trades run.
              </p>
            )}
            {activity.map((ev) => (
              <div key={ev.id} className="px-3 py-2 flex gap-2 text-[11px]">
                <span className="mono text-[var(--muted)] shrink-0">
                  {ev.createdAt
                    ? new Date(ev.createdAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" })
                    : "—"}
                </span>
                <span className="text-white truncate">{ev.message || ev.type}</span>
              </div>
            ))}
          </div>
        </section>

        {primary && (
          <p className="text-[10px] mono text-[var(--muted)] text-center truncate px-2">{primary.publicKey}</p>
        )}
      </div>

      <BottomNav />
    </main>
  );
}
