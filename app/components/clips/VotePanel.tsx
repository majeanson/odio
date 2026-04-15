"use client";
// VotePanel — vote buttons + "all voted Keep" banner.
// Single responsibility: display voting UI for one clip version.

import type { Vote, VoteValue, ClipVersion } from "@/types";

const VOTE_OPTIONS: { value: VoteValue; symbol: string; label: string; sub: string; color: string }[] = [
  { value: "KEEP",   symbol: "✓", label: "Keep",   sub: "Freeze it",  color: "bg-success/15 text-success border-success/30" },
  { value: "REVISE", symbol: "↺", label: "Revise", sub: "Needs work", color: "bg-orange-500/15 text-orange-400 border-orange-500/30" },
  { value: "PASS",   symbol: "—", label: "Pass",   sub: "No opinion", color: "bg-surface text-secondary border-border" },
];

interface VotePanelProps {
  version: ClipVersion;
  votes: Vote[];
  currentUserEmail: string;
  memberCount: number;
  isCasting: boolean;
  onVote: (args: { versionId: string; value: VoteValue }) => void;
}

export function VotePanel({ version, votes, currentUserEmail, memberCount, isCasting, onVote }: VotePanelProps) {
  const myVote = votes.find((v) => v.userEmail === currentUserEmail && v.versionId === version.id);
  const counts = {
    KEEP:   votes.filter((v) => v.versionId === version.id && v.value === "KEEP").length,
    REVISE: votes.filter((v) => v.versionId === version.id && v.value === "REVISE").length,
    PASS:   votes.filter((v) => v.versionId === version.id && v.value === "PASS").length,
  };
  const allVotedKeep = memberCount > 0 && counts.KEEP >= memberCount;

  return (
    <section aria-label="Vote">
      <div className="flex items-baseline gap-2 mb-5 px-1">
        <p className="text-sm font-bold text-muted">Vote</p>
        <span className="text-sm text-muted">
          on v{version.versionNumber}
          {version.description && ` · ${version.description}`}
        </span>
      </div>

      {allVotedKeep && (
        <div className="mb-5 rounded-2xl bg-success/10 border border-success/30 px-5 py-5 flex items-center gap-3">
          <span className="text-success text-2xl" aria-hidden>✓</span>
          <p className="text-base font-semibold text-success">Everyone voted Keep — ready to freeze</p>
        </div>
      )}

      <div className="grid grid-cols-3 gap-3">
        {VOTE_OPTIONS.map(({ value, symbol, label, sub, color }) => {
          const isMyVote = myVote?.value === value;
          const count = counts[value];
          return (
            <button
              key={value}
              onClick={() => onVote({ versionId: version.id, value })}
              disabled={isCasting}
              aria-label={`${label} — ${sub}${isMyVote ? " (your vote)" : ""}`}
              aria-pressed={isMyVote}
              className={`flex flex-col items-center justify-center gap-2 rounded-2xl border px-2 py-8 transition-colors ${
                isMyVote ? color : "bg-surface border-border text-muted hover:bg-elevated"
              }`}
            >
              <span className={`text-4xl leading-none ${isMyVote ? "" : "opacity-40"}`} aria-hidden>{symbol}</span>
              <span className={`text-base font-bold ${isMyVote ? "" : "text-secondary"}`}>{label}</span>
              <span className="text-sm text-muted leading-snug text-center">{sub}</span>
              {count > 0 && <span className="text-base font-semibold tabular-nums">{count}</span>}
            </button>
          );
        })}
      </div>
    </section>
  );
}
