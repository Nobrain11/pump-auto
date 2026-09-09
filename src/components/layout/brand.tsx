import Link from "next/link";
import { cn } from "@/lib/utils/cn";

export function Brand({ compact = false, className }: { compact?: boolean; className?: string }) {
  return (
    <Link href="/" className={cn("flex items-center gap-2", className)}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src="/logo.svg" alt="ARC AUTO" className={compact ? "w-6 h-6" : "w-7 h-7"} />
      {!compact && (
        <div className="leading-tight">
          <p className="text-xs font-semibold tracking-wide text-white">PUMP AUTO</p>
          <p className="text-[9px] mono text-[var(--primary)] tracking-wider">MEME MARKET AUTOPILOT</p>
        </div>
      )}
    </Link>
  );
}
