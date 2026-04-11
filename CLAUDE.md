# Claude Code Guide — Odio

## What This Is

**Odio** — a collaborative jam session recorder and editor for small bands.
- Record songs during a jam from any browser (iOS, Android, desktop) — no install.
- After the jam, anyone in the band opens a link, trims the recording (cut dead air, setup noise), and submits a new version. Repeat until the band is happy, then freeze to a final file.
- Built LAC-first: every feature is defined in `feature.json` before code is written.
- Planned with BMAD (see `../bmad/_bmad-output/odio/`).

## Architecture in One Sentence

Next.js PWA on Vercel. Audio files in Google Drive (free, familiar). All structured metadata (sessions, clips, versions, votes, comments) in a free-tier Postgres (Neon or Vercel Postgres). Auth via NextAuth.js + Google OAuth. No Supabase.

## Stack

| Layer | Choice |
|-------|--------|
| App | Next.js (App Router) + TypeScript + Tailwind CSS |
| Hosting | Vercel (Hobby = free) |
| Auth | NextAuth.js + Google OAuth (drive.file scope) |
| Audio storage | Google Drive API v3 — recorder's account |
| Metadata DB | Neon or Vercel Postgres free tier (sessions, clips, versions, votes, comments) |
| Realtime | Polling every 5-10s when session is active |
| Waveform | wavesurfer.js 7.x + Regions plugin |
| Audio render | fluent-ffmpeg in Next.js API route (freeze only) |
| Edit safety | localStorage (cut marks saved on change, cleared on submit) |
| State | Zustand |
| Cost | $0/month |

## Data Ownership

- **Audio files (.aac)** — Google Drive, under recorder's account, in a shared band folder
- **Everything else** (sessions, clips, versions, votes, comments, stamps, band membership) — Postgres, tiny and free
- **No Supabase** — removed in v0.3 due to storage costs
- **No IndexedDB / offline sync** — localStorage safety net only; submit requires connection

## Recording Reality

- Typical clip: one song = 5–30 min raw. Max ~30 min.
- One session = one jam night = 3–8 clips
- Recorder hits stop → "Next Song →" → immediately starts next recording
- Upload happens as single blob on stop (not chunked — 30min AAC ≈ 43MB, fine in memory)
- Audio transcoded to AAC server-side on upload (cross-browser compatibility)

## Versioning Model

Every clip starts as v1 (raw). Versions are metadata only — cutMarks + annotations + description — pointing at the same source audio. No audio file duplicated per version. Freeze triggers server-side FFmpeg render, produces a real file. Versions are linear: v1 → v2 → v3 → vFinal.

## Feature Domains

- **app-shell** — PWA shell, navigation, dark theme, first-run/onboarding
- **auth** — Google OAuth via NextAuth.js, session, band membership
- **recording** — MediaRecorder, level meter, stamps (🔥⭐❓💡), Next Song flow, upload
- **sessions** — session + clip CRUD, naming, song stage, session notes
- **versioning** — version chain, descriptions, freeze, prune, auto-freeze rules
- **editing** — wavesurfer.js waveform, cut regions, virtual preview, submit version
- **render** — server-side FFmpeg on freeze, public share link
- **band** — band creation, invite link, member list, QR code, Drive folder linking
- **collaboration** — votes, comments, stamp heat map, suggest-a-cut, activity feed
- **storage** — Drive quota awareness, post-freeze cleanup, archive flow

## LAC MCP Workflow

```
1. create_feature          → status: draft
2. read_feature_context    → Claude fills missing fields
3. write_feature_fields    → writes fields, shows remaining gaps
4. advance_feature(active) → validates required fields, transitions
5. advance_feature(frozen) → all fields complete (requires userGuide + componentFile)
```

Transition requirements:
- `draft → active`: analysis, implementation, decisions (1+), successCriteria
- `active → frozen`: all above + tags, knownLimitations + userGuide + componentFile

## Orientation Commands

```
roadmap_view()           → all features by status + priority
get_feature_status(path) → what to do next on a specific feature
audit_decisions()        → surface tech debt and stale decisions
summarize_workspace()    → full project overview
```

## Rules

- Feature.jsons first, code second
- No Supabase — any new feature that needs storage uses Drive (audio) or Postgres (metadata)
- Polling only — no WebSocket infra until proven necessary at scale
- UX feel: **calm, fast, tactile** — designed for dim rehearsal rooms, one hand, mid-jam
- iOS Safari limitations are documented per feature, never silently ignored
