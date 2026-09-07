"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils/cn";

const items = [
  { href: "/", label: "Home", icon: "H" },
  { href: "/hunt", label: "Hunt", icon: "◎" },
  { href: "/terminal", label: "Term", icon: "⌘" },
  { href: "/portfolio", label: "Port", icon: "◈" },
  { href: "/more", label: "More", icon: "···" },
];

export function BottomNav() {
  const pathname = usePathname();

  return (
    <nav className="fixed bottom-0 inset-x-0 z-50 border-t border-[var(--card-border)] bg-[var(--background)]/95 backdrop-blur-sm pb-[env(safe-area-inset-bottom)]">
      <div className="flex justify-around items-center max-w-lg mx-auto h-14">
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
                "flex flex-col items-center justify-center gap-0.5 flex-1 h-full text-[10px] mono transition-colors",
                active ? "text-[var(--primary)]" : "text-[var(--muted)]"
              )}
            >
              <span className="text-sm leading-none font-medium">{item.icon}</span>
              {item.label}
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
