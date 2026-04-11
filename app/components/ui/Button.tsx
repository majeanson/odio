"use client";

import { cn } from "@/lib/utils";
import Link from "next/link";
import type { ButtonHTMLAttributes } from "react";

type Variant = "primary" | "secondary" | "ghost" | "danger";
type Size = "sm" | "md" | "lg";

const variantClasses: Record<Variant, string> = {
  primary:
    // Amber with physical depth shadow — feels like a physical button
    "bg-accent text-[#080808] font-bold tracking-wide " +
    "shadow-[0_4px_0_0_#78350f] " +
    "hover:bg-amber-400 " +
    "active:translate-y-[4px] active:shadow-none " +
    "disabled:opacity-40 disabled:shadow-none disabled:translate-y-0",

  secondary:
    "bg-elevated text-primary border border-border font-semibold " +
    "shadow-[0_3px_0_0_rgba(0,0,0,0.5)] " +
    "hover:bg-surface hover:border-secondary/50 " +
    "active:translate-y-[3px] active:shadow-none " +
    "disabled:opacity-40 disabled:shadow-none disabled:translate-y-0",

  ghost:
    "text-secondary font-semibold " +
    "hover:text-primary hover:bg-elevated/50 " +
    "active:opacity-70 " +
    "disabled:opacity-40",

  danger:
    "bg-danger/15 text-danger font-bold border border-danger/30 " +
    "shadow-[0_3px_0_0_rgba(239,68,68,0.2)] " +
    "hover:bg-danger/25 " +
    "active:translate-y-[3px] active:shadow-none " +
    "disabled:opacity-40 disabled:shadow-none disabled:translate-y-0",
};

const sizeClasses: Record<Size, string> = {
  sm: "h-12 px-5 text-sm rounded-xl",
  md: "h-[60px] px-6 text-base rounded-2xl",
  lg: "h-[68px] px-8 text-lg rounded-2xl",
};

export function buttonClasses(
  variant: Variant = "primary",
  size: Size = "md",
  fullWidth = false,
  extra?: string,
) {
  return cn(
    "inline-flex items-center justify-center gap-2",
    "transition-[transform,box-shadow,background,color] duration-75",
    "focus-visible:outline-[3px] focus-visible:outline-accent focus-visible:outline-offset-3",
    variantClasses[variant],
    sizeClasses[size],
    fullWidth && "w-full",
    extra,
  );
}

// ─── Button ────────────────────────────────────────────────────────────────

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: Size;
  loading?: boolean;
  fullWidth?: boolean;
}

export function Button({
  variant = "primary",
  size = "md",
  loading = false,
  fullWidth = false,
  className,
  disabled,
  children,
  ...props
}: ButtonProps) {
  return (
    <button
      disabled={disabled || loading}
      className={buttonClasses(variant, size, fullWidth, className)}
      {...props}
    >
      {loading ? (
        <span className="size-5 rounded-full border-2 border-current border-t-transparent animate-spin" />
      ) : (
        children
      )}
    </button>
  );
}

// ─── ButtonLink ────────────────────────────────────────────────────────────

interface ButtonLinkProps {
  href: string;
  variant?: Variant;
  size?: Size;
  fullWidth?: boolean;
  className?: string;
  children: React.ReactNode;
  replace?: boolean;
  prefetch?: boolean;
}

export function ButtonLink({
  href,
  variant = "primary",
  size = "md",
  fullWidth = false,
  className,
  children,
  replace,
  prefetch,
}: ButtonLinkProps) {
  return (
    <Link
      href={href}
      replace={replace}
      prefetch={prefetch}
      className={buttonClasses(variant, size, fullWidth, className)}
    >
      {children}
    </Link>
  );
}
