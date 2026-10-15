"use client";
// ApercuClient — the public, no-auth demo of the clip player.
// Single responsibility: let a stranger (or the marcportal.com gallery
// iframe) play with the real player — stamp jumping, cut masking, version
// switching — against canned data and a bundled audio file.
//
// Deliberately NOT built from ClipDetailClient: that component's Team tab
// polls /api/clips/*/votes|comments and its action bar PATCHes — every one
// of those calls would 307 to /login for an anonymous visitor. This page
// composes the safe pieces (WaveformPlayer and static markup) instead, so
// nothing on the demo path can touch auth, Prisma, Drive or FFmpeg.

import { useState } from "react";
import { WaveformPlayer } from "@/components/clips/WaveformPlayer";
import {
  DEMO_AUDIO_URL,
  DEMO_CLIPS,
  DEMO_DURATION_MS,
  DEMO_SESSION,
  type DemoVersion,
} from "@/lib/apercuDemo";

export function ApercuClient() {
  const [clipId, setClipId] = useState(DEMO_CLIPS[0].id);
  const clip = DEMO_CLIPS.find((c) => c.id === clipId) ?? DEMO_CLIPS[0];
  const [versionByClip, setVersionByClip] = useState<Record<string, string>>({});
  const versionId = versionByClip[clip.id] ?? clip.versions[0].id;
  const version = clip.versions.find((v) => v.id === versionId) ?? clip.versions[0];

  return (
    <main className="mx-auto max-w-xl px-4 py-6 space-y-5">
      {/* Header */}
      <header className="flex items-center justify-between">
        <span className="text-lg font-semibold tracking-[0.3em] text-primary">ODIO</span>
        <span className="rounded-full bg-surface px-3 py-1 font-mono text-xs text-muted">
          public demo
        </span>
      </header>

      <div>
        <h1 className="text-xl font-semibold text-primary">
          {DEMO_SESSION.band} — {DEMO_SESSION.name}
        </h1>
        <p className="mt-1 text-sm text-muted leading-snug">
          A session recorder for band jams: record, stamp the good moments, trim on the
          waveform, version the takes. This is a canned jam with fake takes — play with it.
        </p>
      </div>

      {/* Clip tabs */}
      <div className="flex gap-2 overflow-x-auto pb-1">
        {DEMO_CLIPS.map((c) => (
          <button
            key={c.id}
            type="button"
            onClick={() => setClipId(c.id)}
            className={`shrink-0 rounded-full px-4 py-1.5 text-sm transition-colors ${
              c.id === clip.id
                ? "bg-accent text-black font-semibold"
                : "bg-surface text-secondary hover:text-primary"
            }`}
          >
            {c.name}
          </button>
        ))}
      </div>

      {/* The real player, fed the bundled file */}
      <WaveformPlayer
        key={clip.id}
        clipId={clip.id}
        audioUrl={DEMO_AUDIO_URL}
        sourceDurationMs={DEMO_DURATION_MS}
        activeCuts={version.cutMarks}
        stamps={clip.stamps}
      />

      {/* Versions */}
      <section className="space-y-2">
        <h2 className="font-mono text-xs uppercase tracking-widest text-muted">Versions</h2>
        {clip.versions.map((v) => (
          <VersionRow
            key={v.id}
            version={v}
            active={v.id === version.id}
            onSelect={() => setVersionByClip((m) => ({ ...m, [clip.id]: v.id }))}
          />
        ))}
        <p className="text-xs text-muted leading-snug">
          Cuts are masked on the waveform and skipped during playback — switch versions to
          hear the difference. In the real app the band votes keep / revise / pass, then the
          kept version gets frozen and shared.
        </p>
      </section>

      {/* Outro */}
      <footer className="space-y-3 border-t border-surface pt-4">
        <a
          href="/login"
          className="block rounded-2xl bg-accent px-5 py-3 text-center font-semibold text-black"
        >
          Your band? Sign in →
        </a>
        <p className="text-center font-mono text-xs text-muted">
          Built by{" "}
          <a href="https://marcportal.com" className="underline hover:text-primary">
            marc.portal
          </a>
        </p>
      </footer>
    </main>
  );
}

function VersionRow({
  version,
  active,
  onSelect,
}: {
  version: DemoVersion;
  active: boolean;
  onSelect: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onSelect}
      className={`w-full rounded-2xl px-4 py-3 text-left transition-colors ${
        active ? "bg-surface ring-1 ring-accent/60" : "bg-surface/60 hover:bg-surface"
      }`}
    >
      <div className="flex items-center justify-between gap-3">
        <span className="font-mono text-sm text-primary">v{version.versionNumber}</span>
        <span className="font-mono text-xs text-muted">
          {version.cutMarks.length === 0
            ? "no cuts"
            : `${version.cutMarks.length} cut${version.cutMarks.length > 1 ? "s" : ""}`}
        </span>
      </div>
      <p className="mt-1 text-sm text-secondary leading-snug">{version.description}</p>
      <div className="mt-2 flex gap-2 font-mono text-[11px] text-muted">
        <span>KEEP {version.votes.KEEP}</span>
        <span>·</span>
        <span>REVISE {version.votes.REVISE}</span>
        <span>·</span>
        <span>PASS {version.votes.PASS}</span>
      </div>
    </button>
  );
}
