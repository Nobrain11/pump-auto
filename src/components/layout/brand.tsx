import Link from "next/link";
import { cn } from "@/lib/utils/cn";

export function Brand({
  compact = false,
  className,
}: {
  compact?: boolean;
  className?: string;
}) {
  return (
    <Link href="/" className={cn("flex items-center gap-2.5 group", className)}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src="/logo.svg"
        alt="PUMP AUTO"
        className={cn(
          "transition-transform duration-200 group-hover:scale-105",
          compact ? "w-6 h-6" : "w-8 h-8"
        )}
      />
      {!compact && (
        <div className="leading-tight">
          <p className="text-[13px] font-semibold tracking-[0.04em] text-white">
            PUMP AUTO
          </p>
          <p className="text-[9px] mono text-[var(--muted)] tracking-[0.14em]">
            SOLANA TERMINAL
          </p>
        </div>
      )}
    </Link>
  );
}
