"use client";

import Link from "next/link";
import { BottomNav } from "@/components/layout/bottom-nav";

const links = [
  { href: "/more/leaderboard", label: "Leaderboard", desc: "Discover verified traders" },
  { href: "/more/copy-trade", label: "Copy Trade", desc: "Manage copied strategies" },
  { href: "/more/smart-devs", label: "Smart Devs", desc: "Follow proven developers" },
  { href: "/more/wallets", label: "Wallets", desc: "Manage trading wallets" },
  { href: "/more/alerts", label: "Alerts", desc: "Notifications & thresholds" },
  { href: "/more/activity", label: "Activity", desc: "Full event history" },
  { href: "/more/learn", label: "Learn", desc: "Concepts & how it works" },
  { href: "/more/referrals", label: "Referrals", desc: "Invite & rewards" },
  { href: "/more/support", label: "Support", desc: "Help & contact" },
  { href: "/more/settings", label: "Settings", desc: "Trading, risk, notifications" },
  { href: "/more/security", label: "Security", desc: "Sessions, emergency stop" },
];

export default function MorePage() {
  return (
    <main className="min-h-dvh flex flex-col pb-20">
      <header className="px-5 pt-6 pb-4 border-b border-[var(--card-border)]">
        <p className="text-[10px] font-mono tracking-widest text-[var(--muted)] uppercase">
          PUMP AUTO
        </p>
        <h1 className="text-lg font-bold text-white">More</h1>
      </header>

      <div className="flex-1 px-5 py-4 max-w-lg mx-auto w-full">
        <ul className="space-y-1">
          {links.map((item) => (
            <li key={item.href}>
              <Link
                href={item.href}
                className="flex items-center justify-between rounded-xl px-4 py-3.5 hover:bg-[var(--card)] transition-colors"
              >
                <div>
                  <p className="text-sm font-medium text-white">{item.label}</p>
                  <p className="text-xs text-[var(--muted)]">{item.desc}</p>
                </div>
                <span className="text-[var(--muted)]">›</span>
              </Link>
            </li>
          ))}
        </ul>

        <p className="mt-8 text-[10px] text-center text-[var(--muted)] px-4">
          PUMP AUTO will never ask for your private key or seed phrase through support.
        </p>
      </div>

      <BottomNav />
    </main>
  );
}
