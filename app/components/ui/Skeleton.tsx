import { cn } from "@/lib/utils";

interface SkeletonProps {
  className?: string;
}

/**
 * Shimmer skeleton block. Compose multiples to build list skeletons.
 */
export function Skeleton({ className }: SkeletonProps) {
  return (
    <div
      className={cn(
        "animate-pulse rounded-xl bg-elevated",
        className,
      )}
      aria-hidden
    />
  );
}

/** Pre-composed skeleton for a clip/session card */
export function CardSkeleton() {
  return (
    <div className="rounded-2xl border border-border bg-surface p-5 space-y-3">
      <Skeleton className="h-5 w-1/2" />
      <Skeleton className="h-4 w-1/3" />
    </div>
  );
}

/** Pre-composed skeleton for a list of cards */
export function ListSkeleton({ count = 3 }: { count?: number }) {
  return (
    <div className="space-y-3">
      {Array.from({ length: count }).map((_, i) => (
        <CardSkeleton key={i} />
      ))}
    </div>
  );
}
