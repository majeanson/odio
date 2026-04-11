"use client";

import { cn } from "@/lib/utils";
import Link from "next/link";
import type { ButtonHTMLAttributes, AnchorHTMLAttributes } from "react";

type Variant = "primary" | "secondary" | "ghost" | "danger";
type Size = "sm" | "md" | "lg";

const variantClasses: Record<Variant, string> = {
  primary:
    "bg-accent text-base font-medium hover:opacity-90 active:opacity-80 disabled:opacity-40",
  secondary:
    "bg-elevated text-primary border border-border font-medium hover:bg-surface active:opacity-80 disabled:opacity-40",
  ghost:
    "text-secondary font-medium hover:text-primary active:opacity-70 disabled:opacity-40",
  danger:
    "bg-danger/10 text-danger font-medium hover:bg-danger/20 active:opacity-80 disabled:opacity-40",
};

const sizeClasses: Record<Size, string> = {
  sm: "h-9 px-3 text-sm rounded-lg",
  md: "h-11 px-4 text-base rounded-xl",
  lg: "h-14 px-6 text-base rounded-2xl",
};

/** Shared visual classes for all button variants */
export function buttonClasses(
  variant: Variant = "primary",
  size: Size = "md",
  fullWidth = false,
  extra?: string,
) {
  return cn(
    "inline-flex items-center justify-center gap-2 transition-all",
    "focus-visible:outline-2 focus-visible:outline-accent focus-visible:outline-offset-2",
    variantClasses[variant],
    sizeClasses[size],
    fullWidth && "w-full",
    extra,
  );
}

// ─── Button (renders <button>) ─────────────────────────────────────────────

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: Size;
  loading?: boolean;
  fullWidth?: boolean;
}

/**
 * Primary interactive button. Use for click actions.
 * For navigation, use ButtonLink.
 */
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
        <span className="size-4 rounded-full border-2 border-current border-t-transparent animate-spin" />
      ) : (
        children
      )}
    </button>
  );
}

// ─── ButtonLink (renders Next.js <Link>) ───────────────────────────────────

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

/**
 * Button-styled Next.js Link. Use for navigation.
 */
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
