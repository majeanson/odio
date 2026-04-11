import { cn } from "@/lib/utils";
import type { HTMLAttributes } from "react";

interface CardProps extends HTMLAttributes<HTMLDivElement> {
  /** Makes the full card a pressable surface */
  pressable?: boolean;
}

/**
 * Base card surface. Use as the container for session cards, clip cards,
 * version cards, etc. Dark surface (#141414) with border.
 */
export function Card({ className, pressable, children, ...props }: CardProps) {
  return (
    <div
      className={cn(
        "rounded-2xl border border-border bg-surface p-5",
        pressable && "cursor-pointer transition-colors hover:bg-elevated active:bg-elevated/80",
        className,
      )}
      {...props}
    >
      {children}
    </div>
  );
}

export function CardTitle({
  className,
  children,
  ...props
}: HTMLAttributes<HTMLParagraphElement>) {
  return (
    <p
      className={cn("text-lg font-semibold text-primary", className)}
      {...props}
    >
      {children}
    </p>
  );
}

export function CardMeta({
  className,
  children,
  ...props
}: HTMLAttributes<HTMLParagraphElement>) {
  return (
    <p className={cn("text-base text-secondary", className)} {...props}>
      {children}
    </p>
  );
}
