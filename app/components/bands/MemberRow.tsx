"use client";
// MemberRow — a single member card: name, role badge, role management, remove/leave button.
// Single responsibility: render one band member and forward management actions to parent.

import { Badge } from "@/components/ui/Badge";
import type { BandMember } from "@/types";

const ROLE_LABELS: Record<BandMember["role"], string> = {
  RECORDER: "Recorder",
  EDITOR:   "Editor",
  MEMBER:   "Member",
};

const ROLE_VARIANTS: Record<BandMember["role"], "default" | "accent" | "warning" | "success" | "danger"> = {
  RECORDER: "success",
  EDITOR:   "accent",
  MEMBER:   "default",
};

interface MemberRowProps {
  member: BandMember;
  isSelf: boolean;
  /** True when the current user holds the RECORDER role */
  currentUserIsRecorder: boolean;
  /** True while this member's role change request is in flight */
  isChangingRole: boolean;
  onChangeRole: (email: string, role: "EDITOR" | "MEMBER") => void;
  /** Opens the remove/leave confirmation sheet for this member */
  onRemove: (email: string) => void;
}

export function MemberRow({ member: m, isSelf, currentUserIsRecorder, isChangingRole, onChangeRole, onRemove }: MemberRowProps) {
  return (
    <li className="rounded-2xl bg-surface px-5 py-4">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0 flex-1">
          <p className="truncate text-base font-semibold text-primary">
            {m.displayName ?? m.userEmail}
            {isSelf && <span className="ml-2 text-sm text-muted">(you)</span>}
          </p>
          <p className="text-sm text-muted truncate">{m.userEmail}</p>
        </div>
        <Badge variant={ROLE_VARIANTS[m.role]}>{ROLE_LABELS[m.role]}</Badge>
      </div>

      {/* Role management — RECORDER only, for non-RECORDER members who aren't self */}
      {currentUserIsRecorder && !isSelf && m.role !== "RECORDER" && (
        <div className="mt-3 flex items-center gap-2">
          <button
            onClick={() => onChangeRole(m.userEmail, "EDITOR")}
            disabled={isChangingRole || m.role === "EDITOR"}
            className={`rounded-xl px-3 py-1.5 text-xs font-medium transition-colors disabled:opacity-50 ${
              m.role === "EDITOR" ? "bg-accent/20 text-accent" : "bg-elevated text-muted hover:text-primary"
            }`}
          >
            Editor
          </button>
          <button
            onClick={() => onChangeRole(m.userEmail, "MEMBER")}
            disabled={isChangingRole || m.role === "MEMBER"}
            className={`rounded-xl px-3 py-1.5 text-xs font-medium transition-colors disabled:opacity-50 ${
              m.role === "MEMBER" ? "bg-orange-500/20 text-orange-400" : "bg-elevated text-muted hover:text-primary"
            }`}
          >
            Member
          </button>
          <button
            onClick={() => onRemove(m.userEmail)}
            className="ml-auto rounded-xl px-3 py-1.5 text-xs font-medium bg-danger/10 text-danger hover:bg-danger/20 transition-colors"
          >
            Remove
          </button>
        </div>
      )}

      {/* Leave band — non-RECORDER self */}
      {isSelf && m.role !== "RECORDER" && (
        <div className="mt-3">
          <button
            onClick={() => onRemove(m.userEmail)}
            className="rounded-xl px-3 py-1.5 text-xs font-medium bg-danger/10 text-danger hover:bg-danger/20 transition-colors"
          >
            Leave band
          </button>
        </div>
      )}
    </li>
  );
}
