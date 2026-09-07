import { cn } from "@/lib/utils/cn";
import { ButtonHTMLAttributes, forwardRef } from "react";

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: "primary" | "secondary" | "danger" | "ghost" | "outline";
  size?: "xs" | "sm" | "md" | "lg";
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant = "primary", size = "md", disabled, children, ...props }, ref) => {
    const base =
      "inline-flex items-center justify-center font-medium rounded-[var(--radius)] transition-colors disabled:opacity-40 disabled:cursor-not-allowed focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[var(--primary)]";

    const variants = {
      primary: "bg-[var(--primary)] text-[var(--primary-foreground)] hover:brightness-110",
      secondary: "bg-[var(--card-elevated)] border border-[var(--card-border)] text-[var(--foreground)] hover:border-[var(--primary)]/40",
      danger: "bg-[var(--danger)]/15 border border-[var(--danger)]/40 text-[var(--danger)] hover:bg-[var(--danger)]/25",
      ghost: "bg-transparent text-[var(--muted)] hover:text-[var(--foreground)]",
      outline: "border border-[var(--card-border)] bg-transparent text-[var(--foreground)] hover:border-[var(--primary)]/50",
    };

    const sizes = {
      xs: "h-7 px-2.5 text-[11px]",
      sm: "h-8 px-3 text-xs",
      md: "h-9 px-3.5 text-sm",
      lg: "h-10 px-4 text-sm w-full",
    };

    return (
      <button
        ref={ref}
        className={cn(base, variants[variant], sizes[size], className)}
        disabled={disabled}
        {...props}
      >
        {children}
      </button>
    );
  }
);
Button.displayName = "Button";
