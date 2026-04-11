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
    <div className="px-6 py-14 flex flex-col items-center text-center gap-7">
      {/* Band icon */}
      <span className="text-6xl">🎸</span>

      {/* Band info */}
      <div>
        <h2 className="font-display text-3xl font-bold text-primary">{bandName}</h2>
        <p className="mt-2 text-base text-secondary">
          Invited by {creatorEmail}
        </p>
      </div>

      {/* Role info */}
      <div className="rounded-2xl bg-surface px-5 py-4 text-left w-full max-w-xs">
        <p className="text-xs font-bold uppercase tracking-wider text-muted mb-2">
          You&apos;ll join as
        </p>
        <p className="text-base text-primary font-semibold">Editor</p>
        <p className="text-sm text-secondary mt-1">
          Can record and submit new clip versions. Audio is stored in{" "}
          {creatorEmail}&apos;s Google Drive.
        </p>
      </div>

      {/* Error */}
      {error && (
        <p className="text-base text-danger rounded-2xl border border-danger/30 bg-danger/10 px-5 py-4 w-full">
          {error}
        </p>
      )}

      {/* Action */}
      <Button onClick={handleJoin} disabled={loading} fullWidth size="lg">
        {loading ? "Joining…" : `Join ${bandName}`}
      </Button>
    </div>
  );
}
