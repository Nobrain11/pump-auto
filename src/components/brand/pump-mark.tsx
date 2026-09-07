import { cn } from "@/lib/utils/cn";

export function PumpMark({ className, compact = false }: { className?: string; compact?: boolean }) {
  return (
    <div className={cn("flex items-center gap-2", className)} aria-label="PUMP AUTO">
      <svg aria-hidden="true" viewBox="0 0 32 32" className={cn("size-8", compact && "size-7")} fill="none">
        <path d="M7 7h13l5 5-13 13H7l5-13L7 7Z" stroke="currentColor" strokeWidth="2.4" strokeLinejoin="round" />
        <path d="m12 12 8 8M17 7l8 5-5 5" stroke="var(--brand-cyan)" strokeWidth="2" strokeLinecap="round" />
      </svg>
      <span className="leading-none"><strong className="block text-[13px] tracking-[0.16em] text-foreground">PUMP AUTO</strong><span className="block mt-1 text-[8px] font-mono tracking-[0.18em] text-muted-foreground">SOLANA TRADING TERMINAL</span></span>
    </div>
  );
}

export function TokenIdentity({ name, symbol, imageUrl, className }: { name: string; symbol?: string; imageUrl?: string | null; className?: string }) {
  const fallback = (symbol || name || "?").slice(0, 2).toUpperCase();
  return imageUrl ? <img src={imageUrl} alt={`${name} token logo`} className={cn("size-9 rounded-full border border-border object-cover", className)} onError={(event) => { event.currentTarget.style.display = "none"; event.currentTarget.nextElementSibling?.removeAttribute("hidden"); }} /> : null;
}

export function TokenAvatar({ name, symbol, imageUrl }: { name: string; symbol?: string; imageUrl?: string | null }) {
  const fallback = (symbol || name || "?").slice(0, 2).toUpperCase();
  return <div className="relative size-9 shrink-0">{imageUrl && <img src={imageUrl} alt={`${name} token logo`} className="size-9 rounded-full border border-border object-cover" onError={(event) => { event.currentTarget.hidden = true; event.currentTarget.nextElementSibling?.removeAttribute("hidden"); }} />}<span hidden={Boolean(imageUrl)} className="grid size-9 place-items-center rounded-full border border-primary/30 bg-primary/10 font-mono text-[10px] font-bold text-primary">{fallback}</span></div>;
}

export function SectionBanner({ eyebrow, title, detail }: { eyebrow: string; title: string; detail: string }) {
  return <section className="terminal-banner scan-lines relative overflow-hidden border-b border-border px-4 py-4 sm:px-6"><div className="relative z-10"><p className="label text-primary">{eyebrow}</p><h1 className="mt-1 text-xl font-semibold tracking-tight text-foreground sm:text-2xl">{title}</h1><p className="mt-1 text-xs text-muted-foreground">{detail}</p></div></section>;
}

export function StatusDot({ label, tone = "primary" }: { label: string; tone?: "primary" | "warning" | "danger" }) { return <span className="inline-flex items-center gap-1.5 text-[10px] font-mono uppercase tracking-[0.12em] text-muted-foreground"><i className={cn("size-1.5 rounded-full pulse-dot", tone === "primary" ? "bg-primary" : tone === "warning" ? "bg-warning" : "bg-danger")} />{label}</span>; }

export function Metric({ label, value, tone }: { label: string; value: string; tone?: "primary" | "warning" | "danger" }) { return <div className="metric-cell"><span className="label text-muted-foreground">{label}</span><strong className={cn("mt-1 block font-mono text-sm", tone === "primary" && "text-primary", tone === "warning" && "text-warning", tone === "danger" && "text-danger")}>{value}</strong></div>; }

export function Panel({ children, className }: { children: React.ReactNode; className?: string }) { return <section className={cn("panel", className)}>{children}</section>; }
export function PanelHeading({ eyebrow, title, action }: { eyebrow?: string; title: string; action?: React.ReactNode }) { return <div className="flex items-start justify-between gap-3 border-b border-border px-4 py-3"><div>{eyebrow && <p className="label text-primary">{eyebrow}</p>}<h2 className="mt-1 text-sm font-semibold tracking-wide text-foreground">{title}</h2></div>{action}</div>; }

export function NetworkBackdrop() { return <div aria-hidden="true" className="pointer-events-none absolute inset-0 opacity-50 [background-image:linear-gradient(rgba(98,113,255,.07) 1px,transparent 1px),linear-gradient(90deg,rgba(98,113,255,.07) 1px,transparent 1px)] [background-size:24px_24px] after:absolute after:inset-0 after:bg-[radial-gradient(circle_at_80%_40%,rgba(0,229,255,.11),transparent_30%),radial-gradient(circle_at_20%_80%,rgba(124,58,237,.1),transparent_35%)]" />; }

export { cn };
