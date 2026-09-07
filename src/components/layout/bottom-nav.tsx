"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils/cn";

const items = [
  { href: "/", label: "Home", icon: "⌂" },
  { href: "/hunt", label: "Hunt", icon: "◎" },
  { href: "/terminal", label: "Terminal", icon: "⌘" },
  { href: "/portfolio", label: "Portfolio", icon: "◈" },
  { href: "/more", label: "More", icon: "⋯" },
];

export function BottomNav() {
  const pathname = usePathname();

  return (
    <nav className="fixed bottom-0 inset-x-0 z-50 border-t border-[var(--card-border)] bg-[var(--card)]/95 backdrop-blur-md pb-[env(safe-area-inset-bottom)]">
      <div className="flex justify-around items-center max-w-lg mx-auto h-16">
        {items.map((item) => {
          const active =
            item.href === "/"
              ? pathname === "/"
              : pathname.startsWith(item.href);
          return (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                "flex flex-col items-center justify-center gap-0.5 flex-1 h-full text-[10px] font-medium transition-colors",
                active ? "text-[var(--primary)]" : "text-[var(--muted)]"
              )}
            >
              <span className="text-lg leading-none">{item.icon}</span>
              {item.label}
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
