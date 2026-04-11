import { cn } from "@/lib/utils";
import type { ReactNode } from "react";

interface EmptyStateProps {
  icon?: string; // emoji or single character
  title: string;
  description?: string;
  action?: ReactNode;
  className?: string;
}

/**
 * Generic empty state. Used across all zero-content views:
 * no sessions, no clips, no versions, no bands.
 * Keeps the user oriented and gives a clear next action.
 */
export function EmptyState({
  icon,
  title,
  description,
  action,
  className,
}: EmptyStateProps) {
  return (
    <div
      className={cn(
        "flex flex-col items-center justify-center gap-4 py-24 px-8 text-center",
        className,
      )}
    >
      {icon && <span className="text-7xl leading-none">{icon}</span>}
      <p className="font-display text-3xl font-bold text-primary">{title}</p>
      {description && (
        <p className="text-base text-secondary max-w-sm">{description}</p>
      )}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}
