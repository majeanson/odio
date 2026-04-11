import { cn } from "@/lib/utils";
import type { HTMLAttributes } from "react";

type BadgeVariant = "default" | "accent" | "success" | "danger" | "muted" | "warning";

interface BadgeProps extends HTMLAttributes<HTMLSpanElement> {
  variant?: BadgeVariant;
}

const variantClasses: Record<BadgeVariant, string> = {
  default: "bg-elevated text-secondary",
  accent:  "bg-accent/20 text-accent",
  success: "bg-success/20 text-success",
  danger:  "bg-danger/20 text-danger",
  muted:   "bg-surface text-muted border border-border",
  warning: "bg-orange-500/20 text-orange-400",
};

/**
 * Inline status badge. Used for version count, frozen lock, stage chip,
 * processing state, etc.
 */
export function Badge({
  variant = "default",
  className,
  children,
  ...props
}: BadgeProps) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium",
        variantClasses[variant],
        className,
      )}
      {...props}
    >
      {children}
    </span>
  );
}
