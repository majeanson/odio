"use client";
// DriveActionWarning — prominent callout shown inside any confirmation sheet
// that will permanently mutate files on Google Drive (not just Postgres).
// Use whenever a user action calls deleteDriveFile or uploadDriveFile in a
// destructive / irreversible way.

interface DriveActionWarningProps {
  /** Optional override for the body copy. */
  message?: string;
}

export function DriveActionWarning({
  message = "This will permanently delete files from your Google Drive — not just from Odio. It cannot be undone.",
}: DriveActionWarningProps) {
  return (
    <div className="flex items-start gap-3 rounded-2xl border border-amber-500/30 bg-amber-500/10 px-4 py-3">
      {/* Google Drive icon (simplified triangle mark) */}
      <svg
        viewBox="0 0 87.3 78"
        className="size-5 shrink-0 mt-0.5"
        aria-hidden
      >
        <path
          d="M6.6 66.85l3.85 6.65c.8 1.4 1.95 2.5 3.3 3.3l13.75-23.8H0a7.3 7.3 0 0 0 .98 3.55z"
          fill="#0066da"
        />
        <path
          d="M43.65 25L29.9 1.2a7.3 7.3 0 0 0-3.3 3.3L.98 49.55A7.3 7.3 0 0 0 0 53h27.5z"
          fill="#00ac47"
        />
        <path
          d="M73.55 76.8a7.3 7.3 0 0 0 3.3-3.3l1.6-2.75 7.65-13.25a7.3 7.3 0 0 0 .98-3.5H59.8l5.85 11.2z"
          fill="#ea4335"
        />
        <path
          d="M43.65 25L57.4 1.2A7.3 7.3 0 0 0 53.85 0H33.45c-1.4 0-2.7.4-3.85 1.2z"
          fill="#00832d"
        />
        <path
          d="M59.8 53H27.5L13.75 76.8c1.15.8 2.45 1.2 3.85 1.2h52.1c1.4 0 2.7-.4 3.85-1.2z"
          fill="#2684fc"
        />
        <path
          d="M73.4 26.5l-13-22.5a7.3 7.3 0 0 0-3.3-3.3L43.65 25 59.8 53h27.45a7.3 7.3 0 0 0-.98-3.5z"
          fill="#ffba00"
        />
      </svg>
      <div>
        <p className="text-sm font-semibold text-amber-400">Google Drive action</p>
        <p className="text-xs text-amber-300/80 mt-0.5 leading-relaxed">{message}</p>
      </div>
    </div>
  );
}
