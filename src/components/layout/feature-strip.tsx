"use client";

import Link from "next/link";
import { cn } from "@/lib/utils/cn";

const features = [
  { href: "/hunt", label: "Hunt", hint: "Scan", icon: "◎" },
  { href: "/terminal", label: "Auto", hint: "Hunter", icon: "⌘" },
  { href: "/portfolio", label: "Book", hint: "Positions", icon: "◈" },
  { href: "/more/smart-devs", label: "Devs", hint: "Intel", icon: "◆" },
];

export function FeatureStrip({ className }: { className?: string }) {
  return (
    <div className={cn("grid grid-cols-4 gap-1.5", className)}>
      {features.map((f) => (
        <Link
          key={f.href}
          href={f.href}
          className="panel flex flex-col items-center justify-center gap-0.5 py-2.5 px-1 hover:border-[var(--primary)]/40 transition-colors"
        >
          <span className="text-sm text-[var(--primary)] leading-none">{f.icon}</span>
          <span className="text-[10px] mono text-white font-medium">{f.label}</span>
          <span className="text-[9px] text-[var(--muted)] leading-none">{f.hint}</span>
        </Link>
      ))}
    </div>
  );
}
