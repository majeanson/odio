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
        "flex flex-col items-center justify-center gap-3 py-16 px-6 text-center",
        className,
      )}
    >
      {icon && <span className="text-4xl leading-none">{icon}</span>}
      <p className="text-base font-medium text-primary">{title}</p>
      {description && (
        <p className="text-sm text-secondary max-w-xs">{description}</p>
      )}
      {action && <div className="mt-2">{action}</div>}
    </div>
  );
}
