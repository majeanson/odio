"use client";

// Client-side shell for authenticated routes.
// Mounts the BottomTabBar (with active tab derived from pathname),
// the UploadBanner (driven by usePendingUploads), and renders children.
//
// Tab bar is hidden only on /edit routes (full-screen waveform editor).
// /record is NOT hidden — users need navigation during and after recording.

import { usePathname, useSearchParams } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { BottomTabBar } from "@/components/layout/BottomTabBar";
import { UploadBanner } from "@/components/common/UploadBanner";
import { usePendingUploads } from "@/hooks/usePendingUploads";
import type { BandRole } from "@/types";

export function AuthShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const searchParams = useSearchParams();

  // Extract bandId from /bands/[bandId]/... (band routes)
  // or from ?bandId= query param (/record, /record/post)
  const bandMatch = pathname.match(/^\/bands\/([^/]+)/);
  const bandId = bandMatch?.[1] ?? searchParams.get("bandId") ?? null;

  // Extract sessionId from /sessions/[sessionId]/... or ?sessionId= param
  const sessionMatch = pathname.match(/\/sessions\/([^/]+)/);
  const sessionId = sessionMatch?.[1] ?? searchParams.get("sessionId") ?? undefined;

  // Hide tab bar only on full-screen clip editor (/edit routes)
  const showTabBar = !pathname.includes("/edit");

  const { pendingUploads, retryUpload, discardUpload, saveToDevice } = usePendingUploads();

  // Fetch current user's role in this band — gates the Record tab for MEMBERs.
  // Disabled when no bandId (landing pages, /setup, etc.).
  const { data: meData } = useQuery<{ role: BandRole }>({
    queryKey: ["bandMe", bandId],
    queryFn: () => fetch(`/api/bands/${bandId}/me`).then((r) => r.json()),
    enabled: !!bandId,
    staleTime: 60_000, // role changes are rare — don't refetch on every focus
  });
  const memberRole = meData?.role ?? null;

  return (
    <>
      <UploadBanner
        uploads={pendingUploads}
        onRetry={retryUpload}
        onDiscard={discardUpload}
        onSaveToDevice={saveToDevice}
      />
      {children}
      {showTabBar && bandId && (
        <BottomTabBar bandId={bandId} sessionId={sessionId} memberRole={memberRole} />
      )}
    </>
  );
}
