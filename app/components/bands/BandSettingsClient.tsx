"use client";

// Client-side band settings UI.
// Shows: member list with role management, invite link, Drive folder, storage quota.
// RECORDER can change member roles and remove members.
// Any member can remove themselves (leave band).

import { useState, useEffect } from "react";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import type { BandMember } from "@/types";

const ROLE_LABELS: Record<BandMember["role"], string> = {
  RECORDER: "Recorder",
  EDITOR: "Editor",
  MEMBER: "Member",
};

const ROLE_VARIANTS: Record<
  BandMember["role"],
  "default" | "accent" | "warning" | "success" | "danger"
> = {
  RECORDER: "success",
  EDITOR: "accent",
  MEMBER: "default",
};

interface StorageInfo {
  quotaUsedBytes: number;
  quotaLimitBytes: number;
  odioFileCount: number;
  estimatedBandBytes: number;
  quotaUnavailable?: boolean;
}

interface BandSettingsClientProps {
  bandId: string;
  bandName: string;
  members: BandMember[];
  currentUserEmail: string;
  currentUserRole: BandMember["role"];
  inviteCode: string;
  driveFolderId: string;
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
}

export function BandSettingsClient({
  bandId,
  bandName,
  members: initialMembers,
  currentUserEmail,
  currentUserRole,
  inviteCode,
  driveFolderId,
}: BandSettingsClientProps) {
  const [members, setMembers] = useState<BandMember[]>(initialMembers);
  const [copied, setCopied] = useState(false);
  const [inviteUrl, setInviteUrl] = useState(`/join/${inviteCode}`);
  const [storage, setStorage] = useState<StorageInfo | null>(null);
  const [storageLoading, setStorageLoading] = useState(false);
  const [roleChanging, setRoleChanging] = useState<string | null>(null);
  const [removing, setRemoving] = useState<string | null>(null);

  useEffect(() => {
    setInviteUrl(`${window.location.origin}/join/${inviteCode}`);
  }, [inviteCode]);

  useEffect(() => {
    setStorageLoading(true);
    fetch(`/api/bands/${bandId}/storage`)
      .then((r) => r.json())
      .then((data) => setStorage(data))
      .catch(() => {})
      .finally(() => setStorageLoading(false));
  }, [bandId]);

  async function handleCopyInvite() {
    const url = `${window.location.origin}/join/${inviteCode}`;
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Clipboard API not available — silently fail
    }
  }

  async function changeRole(userEmail: string, newRole: "EDITOR" | "MEMBER") {
    setRoleChanging(userEmail);
    const res = await fetch(`/api/bands/${bandId}/members`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ targetEmail: userEmail, role: newRole }),
    });
    if (res.ok) {
      setMembers((prev) =>
        prev.map((m) => (m.userEmail === userEmail ? { ...m, role: newRole } : m)),
      );
    }
    setRoleChanging(null);
  }

  async function removeMember(userEmail: string) {
    setRemoving(userEmail);
    const res = await fetch(`/api/bands/${bandId}/members`, {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ targetEmail: userEmail }),
    });
    if (res.ok) {
      if (userEmail === currentUserEmail) {
        // Self-removal — navigate away
        window.location.href = "/bands";
      } else {
        setMembers((prev) => prev.filter((m) => m.userEmail !== userEmail));
      }
    }
    setRemoving(null);
  }

  const driveFolderUrl = `https://drive.google.com/drive/folders/${driveFolderId}`;
  const isRecorder = currentUserRole === "RECORDER";

  return (
    <div className="px-4 py-4 space-y-8">
      {/* Band name */}
      <section>
        <p className="text-xs font-medium uppercase tracking-wider text-muted mb-3">
          Band
        </p>
        <p className="text-lg font-semibold text-primary">{bandName}</p>
      </section>

      {/* Invite link */}
      <section>
        <p className="text-xs font-medium uppercase tracking-wider text-muted mb-3">
          Invite link
        </p>
        <div className="rounded-xl bg-surface p-4 space-y-3">
          <p className="break-all font-mono text-xs text-secondary select-all">
            {inviteUrl}
          </p>
          <Button onClick={handleCopyInvite} variant="secondary" fullWidth>
            {copied ? "Copied!" : "Copy invite link"}
          </Button>
          <p className="text-xs text-muted">
            Share this link with bandmates. They&apos;ll join as Editors by
            default and can record to your Drive folder.
          </p>
        </div>
      </section>

      {/* Members */}
      <section>
        <p className="text-xs font-medium uppercase tracking-wider text-muted mb-3">
          Members ({members.length})
        </p>
        <ul className="space-y-2" role="list">
          {members.map((m) => {
            const isSelf = m.userEmail === currentUserEmail;
            const isChanging = roleChanging === m.userEmail;
            const isRemoving = removing === m.userEmail;

            return (
              <li
                key={m.userEmail}
                className="rounded-xl bg-surface px-4 py-3"
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium text-primary">
                      {m.displayName ?? m.userEmail}
                      {isSelf && (
                        <span className="ml-2 text-xs text-muted">(you)</span>
                      )}
                    </p>
                    <p className="text-xs text-muted truncate">{m.userEmail}</p>
                  </div>

                  <div className="flex items-center gap-2 shrink-0">
                    <Badge variant={ROLE_VARIANTS[m.role]}>
                      {ROLE_LABELS[m.role]}
                    </Badge>
                  </div>
                </div>

                {/* Role management — RECORDER only, non-RECORDER members */}
                {isRecorder && !isSelf && m.role !== "RECORDER" && (
                  <div className="mt-2 flex items-center gap-2">
                    <select
                      value={m.role}
                      disabled={isChanging}
                      onChange={(e) =>
                        changeRole(m.userEmail, e.target.value as "EDITOR" | "MEMBER")
                      }
                      className="rounded-lg border border-border bg-elevated px-2 py-1 text-xs text-primary focus:border-accent focus:outline-none disabled:opacity-50"
                    >
                      <option value="EDITOR">Editor</option>
                      <option value="MEMBER">Member</option>
                    </select>

                    <button
                      onClick={() => removeMember(m.userEmail)}
                      disabled={isRemoving}
                      className="text-xs text-danger underline underline-offset-2 disabled:opacity-50"
                    >
                      {isRemoving ? "Removing…" : "Remove"}
                    </button>
                  </div>
                )}

                {/* Self-removal (leave band) — non-RECORDER members */}
                {isSelf && m.role !== "RECORDER" && (
                  <div className="mt-2">
                    <button
                      onClick={() => removeMember(m.userEmail)}
                      disabled={isRemoving}
                      className="text-xs text-danger underline underline-offset-2 disabled:opacity-50"
                    >
                      {isRemoving ? "Leaving…" : "Leave band"}
                    </button>
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      </section>

      {/* Drive folder + Storage quota */}
      <section>
        <p className="text-xs font-medium uppercase tracking-wider text-muted mb-3">
          Storage
        </p>
        <div className="rounded-xl bg-surface p-4 space-y-3">
          <p className="text-sm text-secondary">
            Audio is stored in the band creator&apos;s Google Drive.
          </p>
          <a
            href={driveFolderUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1.5 text-sm text-accent underline underline-offset-4"
          >
            Open Drive folder
            <svg
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth={2}
              strokeLinecap="round"
              strokeLinejoin="round"
              className="size-3"
              aria-hidden
            >
              <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" />
              <polyline points="15 3 21 3 21 9" />
              <line x1="10" y1="14" x2="21" y2="3" />
            </svg>
          </a>

          {/* Quota bar */}
          {storageLoading ? (
            <div className="flex items-center gap-2">
              <span className="size-3.5 rounded-full border-2 border-secondary border-t-transparent animate-spin" />
              <span className="text-xs text-muted">Loading storage info…</span>
            </div>
          ) : storage ? (
            <div className="space-y-1.5">
              {!storage.quotaUnavailable && storage.quotaLimitBytes > 0 && (
                <>
                  <div className="flex justify-between text-xs text-muted">
                    <span>{formatBytes(storage.quotaUsedBytes)} used</span>
                    <span>{formatBytes(storage.quotaLimitBytes)} total</span>
                  </div>
                  <div className="h-2 w-full rounded-full bg-elevated overflow-hidden">
                    <div
                      className="h-full rounded-full bg-accent transition-all"
                      style={{
                        width: `${Math.min(100, (storage.quotaUsedBytes / storage.quotaLimitBytes) * 100).toFixed(1)}%`,
                      }}
                    />
                  </div>
                </>
              )}
              <p className="text-xs text-muted">
                {storage.odioFileCount} file{storage.odioFileCount !== 1 ? "s" : ""} in Odio folder
                {storage.estimatedBandBytes > 0 && (
                  <> · ~{formatBytes(storage.estimatedBandBytes)}</>
                )}
              </p>
              {storage.quotaUnavailable && (
                <p className="text-xs text-muted italic">
                  Drive quota unavailable — reconnect Google account to see usage
                </p>
              )}
            </div>
          ) : null}
        </div>
      </section>
    </div>
  );
}
