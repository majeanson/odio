"use client";

// Client-side shell for authenticated routes.
// Mounts the BottomTabBar (with active tab derived from pathname),
// the UploadBanner (driven by usePendingUploads), and renders children.
//
// Hidden on /record routes (full-screen takeover).

import { usePathname } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { BottomTabBar } from "@/components/layout/BottomTabBar";
import { UploadBanner } from "@/components/common/UploadBanner";
import { usePendingUploads } from "@/hooks/usePendingUploads";
import type { BandRole } from "@/types";

export function AuthShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();

  // Extract bandId from /bands/[bandId]/...
  const bandMatch = pathname.match(/^\/bands\/([^/]+)/);
  const bandId = bandMatch?.[1] ?? null;

  // Extract sessionId from /sessions/[sessionId]/...
  const sessionMatch = pathname.match(/\/sessions\/([^/]+)/);
  const sessionId = sessionMatch?.[1];

  // Hide tab bar on recording and editing routes (full-screen takeovers)
  const showTabBar =
    !pathname.startsWith("/record") && !pathname.includes("/edit");

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
        <BottomTabBar bandId={bandId!} sessionId={sessionId} memberRole={memberRole} />
      )}
    </>
  );
}
