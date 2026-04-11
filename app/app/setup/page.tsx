"use client";

// First-run band creation wizard.
// Shown when a signed-in user has no band memberships.
// Steps: name your band → creates Drive folder + Postgres record → shows invite.

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/Button";

type Step = "name" | "creating" | "done";

export default function SetupPage() {
  const router = useRouter();
  const [step, setStep] = useState<Step>("name");
  const [bandName, setBandName] = useState("");
  const [error, setError] = useState("");
  const [inviteCode, setInviteCode] = useState("");
  const [bandId, setBandId] = useState("");

  async function createBand() {
    if (!bandName.trim()) return;
    setStep("creating");
    setError("");

    try {
      const res = await fetch("/api/bands", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: bandName.trim() }),
      });

      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error ?? "Failed to create band");
      }

      const data = await res.json();
      setInviteCode(data.inviteCode);
      setBandId(data.id);
      setStep("done");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
      setStep("name");
    }
  }

  const inviteUrl =
    typeof window !== "undefined"
      ? `${window.location.origin}/join/${inviteCode}`
      : "";

  async function copyInvite() {
    await navigator.clipboard.writeText(inviteUrl).catch(() => {});
  }

  return (
    <div className="flex min-h-svh flex-col items-center justify-center gap-8 px-6 bg-base">
      <div className="w-full max-w-sm space-y-6">
        {/* Header */}
        <div>
          <h1 className="text-2xl font-bold text-primary">
            {step === "done" ? "Band created!" : "Create your band"}
          </h1>
          <p className="mt-1 text-sm text-secondary">
            {step === "done"
              ? "Share the invite link with your bandmates."
              : "Give your band a name to get started."}
          </p>
        </div>

        {step === "name" && (
          <div className="space-y-4">
            <input
              autoFocus
              type="text"
              value={bandName}
              onChange={(e) => setBandName(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && createBand()}
              placeholder="The Broken Amps"
              maxLength={60}
              className="w-full rounded-xl border border-border bg-surface px-4 py-3 text-primary placeholder:text-muted focus:border-accent focus:outline-none"
            />
            {error && <p className="text-sm text-danger">{error}</p>}
            <Button
              onClick={createBand}
              disabled={!bandName.trim()}
              fullWidth
              size="lg"
            >
              Create band
            </Button>
          </div>
        )}

        {step === "creating" && (
          <div className="flex flex-col items-center gap-3 py-8">
            <span className="size-8 rounded-full border-2 border-accent border-t-transparent animate-spin" />
            <p className="text-sm text-secondary">Setting up your band…</p>
          </div>
        )}

        {step === "done" && (
          <div className="space-y-4">
            {/* Drive sharing note */}
            <div className="rounded-xl border border-border bg-surface p-4 text-sm text-secondary space-y-1">
              <p className="font-medium text-primary">One setup step</p>
              <p>
                After bandmates join, share your Google Drive folder with their
                email so they can hear the recordings.
              </p>
            </div>

            {/* Invite link */}
            <div className="space-y-2">
              <p className="text-xs text-muted uppercase tracking-wide">
                Invite link
              </p>
              <div className="flex items-center gap-2 rounded-xl border border-border bg-surface p-3">
                <span className="flex-1 truncate text-sm font-mono text-secondary">
                  {inviteUrl}
                </span>
                <Button variant="ghost" size="sm" onClick={copyInvite}>
                  Copy
                </Button>
              </div>
            </div>

            <Button
              fullWidth
              size="lg"
              onClick={() => router.push(`/bands/${bandId}`)}
            >
              Go to sessions
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}
