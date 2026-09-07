"use client";

import Link from "next/link";
import { BottomNav } from "@/components/layout/bottom-nav";
import { Brand } from "@/components/layout/brand";

const sections = [
  {
    title: "Intelligence",
    items: [
      { href: "/more/smart-devs", label: "Smart Devs", hint: "Developer intelligence" },
      { href: "/more/smart-devs", label: "Smart Money", hint: "Tracked wallets (soon)" },
      { href: "/more/smart-devs", label: "Leaderboard", hint: "Ranked traders (soon)" },
      { href: "/more/smart-devs", label: "Copy Trade", hint: "Mirror wallets (soon)" },
    ],
  },
  {
    title: "Account",
    items: [
      { href: "/more/wallets", label: "Wallets", hint: "Balances & keys" },
      { href: "/more/activity", label: "Activity", hint: "Event timeline" },
      { href: "/more/settings", label: "Settings", hint: "Risk & preferences" },
      { href: "/more/security", label: "Security", hint: "Encryption & sessions" },
    ],
  },
  {
    title: "System",
    items: [
      { href: "/terminal", label: "Emergency Stop", hint: "Halt new entries" },
      { href: "/more/learn", label: "Learn", hint: "Terminal concepts" },
      { href: "/more/support", label: "Support", hint: "Help & tickets" },
    ],
  },
];

export default function MorePage() {
  return (
    <main className="min-h-dvh flex flex-col pb-16">
      <header className="px-4 pt-4 pb-3 border-b border-[var(--card-border)] flex items-center justify-between">
        <Brand />
        <span className="label">More</span>
      </header>

      <div className="flex-1 px-4 py-4 max-w-lg mx-auto w-full space-y-5">
        {sections.map((sec) => (
          <section key={sec.title} className="space-y-1.5">
            <h2 className="label px-0.5">{sec.title}</h2>
            <div className="panel divide-y divide-[var(--border-subtle)]">
              {sec.items.map((item) => (
                <Link
                  key={item.label}
                  href={item.href}
                  className="flex items-center justify-between px-3 py-2.5 hover:bg-white/[0.02]"
                >
                  <div>
                    <p className="text-sm text-white">{item.label}</p>
                    <p className="text-[10px] text-[var(--muted)]">{item.hint}</p>
                  </div>
                  <span className="text-[var(--muted)] text-xs">›</span>
                </Link>
              ))}
            </div>
          </section>
        ))}
      </div>

      <BottomNav />
    </main>
  );
}
