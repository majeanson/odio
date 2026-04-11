"use client";

// Client side of the join-band flow.
// Shows band name, confirm button, handles API call + redirect.

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/Button";

interface JoinBandClientProps {
  bandId: string;
  bandName: string;
  inviteCode: string;
  creatorEmail: string;
}

export function JoinBandClient({
  bandId,
  bandName,
  inviteCode,
  creatorEmail,
}: JoinBandClientProps) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleJoin() {
    setLoading(true);
    setError(null);

    try {
      const res = await fetch(`/api/bands/${bandId}/join`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ inviteCode }),
      });

      if (res.ok) {
        router.push(`/bands/${bandId}`);
      } else {
        const data = await res.json().catch(() => ({}));
        setError(data?.error ?? "Failed to join. Please try again.");
      }
    } catch {
      setError("Network error. Please check your connection.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="px-6 py-12 flex flex-col items-center text-center gap-6">
      {/* Band icon */}
      <span className="text-5xl">🎸</span>

      {/* Band info */}
      <div>
        <h2 className="text-2xl font-bold text-primary">{bandName}</h2>
        <p className="mt-2 text-sm text-secondary">
          Invited by {creatorEmail}
        </p>
      </div>

      {/* Role info */}
      <div className="rounded-xl bg-surface px-4 py-3 text-left w-full max-w-xs">
        <p className="text-xs font-medium uppercase tracking-wider text-muted mb-2">
          You&apos;ll join as
        </p>
        <p className="text-sm text-primary font-medium">Editor</p>
        <p className="text-xs text-secondary mt-1">
          Can record and submit new clip versions. Audio is stored in{" "}
          {creatorEmail}&apos;s Google Drive.
        </p>
      </div>

      {/* Error */}
      {error && (
        <p className="text-sm text-danger rounded-xl border border-danger/30 bg-danger/10 px-4 py-3 w-full">
          {error}
        </p>
      )}

      {/* Action */}
      <Button onClick={handleJoin} disabled={loading} fullWidth>
        {loading ? "Joining…" : `Join ${bandName}`}
      </Button>
    </div>
  );
}
