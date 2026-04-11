"use client";

// Catalog client — segmented Final / Raw tabs over the cross-session clip list.
// Polling keeps the catalog fresh during an active jam (votes, new clips).
//
// Future: Album grouping will slot in here — a third tab or a grouped view
// over Final clips, where each album is a named collection of frozen songs.

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { EmptyState } from "@/components/ui/EmptyState";
import { CatalogClipCard } from "@/components/clips/CatalogClipCard";
import type { CatalogClip } from "@/app/api/bands/[bandId]/catalog/route";

interface CatalogClientProps {
  bandId: string;
  initialClips: CatalogClip[];
}

type Tab = "final" | "raw";

export function CatalogClient({ bandId, initialClips }: CatalogClientProps) {
  const [activeTab, setActiveTab] = useState<Tab>("final");

  const { data: clips = initialClips } = useQuery<CatalogClip[]>({
    queryKey: ["catalog", bandId],
    queryFn: () =>
      fetch(`/api/bands/${bandId}/catalog`).then((r) => r.json()),
    initialData: initialClips,
    staleTime: 15_000,
    refetchInterval: 15_000,
  });

  const finalClips = clips.filter((c) => c.frozen);
  const rawClips = clips.filter((c) => !c.frozen);
  const shown = activeTab === "final" ? finalClips : rawClips;

  return (
    <div>
      {/* Segmented tab control */}
      <div className="mx-5 mb-5 flex rounded-2xl bg-elevated p-1 gap-1">
        {(["final", "raw"] as Tab[]).map((tab) => {
          const count = tab === "final" ? finalClips.length : rawClips.length;
          const isActive = activeTab === tab;
          return (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={`flex-1 flex items-center justify-center gap-2 rounded-xl py-2.5 text-sm font-bold uppercase tracking-wide transition-all ${
                isActive
                  ? "bg-surface text-primary shadow-sm"
                  : "text-muted hover:text-secondary"
              }`}
            >
              {tab === "final" ? (
                <>
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}
                    strokeLinecap="round" strokeLinejoin="round" className="size-4" aria-hidden>
                    <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
                    <path d="M7 11V7a5 5 0 0 1 10 0v4" />
                  </svg>
                  Final
                </>
              ) : (
                <>
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}
                    strokeLinecap="round" strokeLinejoin="round" className="size-4" aria-hidden>
                    <path d="M9 18V5l12-2v13" />
                    <circle cx="6" cy="18" r="3" />
                    <circle cx="18" cy="16" r="3" />
                  </svg>
                  Raw
                </>
              )}
              {count > 0 && (
                <span className={`text-xs tabular-nums ${isActive ? "text-accent font-bold" : "text-muted"}`}>
                  {count}
                </span>
              )}
            </button>
          );
        })}
      </div>

      {/* Clip list */}
      {shown.length === 0 ? (
        activeTab === "final" ? (
          <EmptyState
            icon="🔒"
            title="No final songs yet"
            description="Freeze a clip from the editing view to lock it as a final version — it'll appear here for the whole band."
          />
        ) : (
          <EmptyState
            icon="🎵"
            title="No raw clips yet"
            description="Record a new jam session and your clips will show up here before they're frozen."
          />
        )
      ) : (
        <ul className="space-y-3 px-5" role="list">
          {shown.map((clip) => (
            <li key={clip.id}>
              <CatalogClipCard clip={clip} bandId={bandId} />
            </li>
          ))}
        </ul>
      )}

      {/* Future: Album grouping placeholder */}
      {/* Albums will appear here as named collections of frozen clips, each stored
          as a Drive subfolder. Planned as the next iteration of this view. */}
    </div>
  );
}
