# Odio

> Record your jams. Trim the noise. Converge on the take.

A collaborative jam session recorder and editor for small bands — built as a web PWA, works on any device from any browser, no install required.

---

## What It Does

1. **Record** — The recorder opens Odio in a browser during a jam. Hits Record between songs. Stamps 🔥 moments while playing. Hits Stop → "Next Song →". Repeats all night.
2. **Edit** — After the jam (in the car, at home), anyone in the band opens a clip, sees the waveform, drags handles to remove setup time and dead air, previews the result, and submits a new version.
3. **Version** — Every edit creates a new version (v1 → v2 → v3...). Versions are just metadata (cut instructions) — no audio duplication. The band iterates until happy.
4. **Freeze** — When the version is final, freeze it. Server renders a clean audio file. Download it or share a public link.
5. **Vote** — Band members vote Keep / Revise / Pass on each version. Drop timestamped comments. See a heat map of 🔥 moments from the original recording.

---

## Stack

| Layer | Choice | Why |
|-------|--------|-----|
| App | Next.js PWA | Works on iOS, Android, desktop — no install |
| Auth | NextAuth.js + Google OAuth | One sign-in, covers Drive access |
| Audio storage | Google Drive | Free (15GB), familiar, band already uses it |
| Metadata | Neon / Vercel Postgres (free tier) | Sessions, clips, versions, votes — tiny text data |
| Waveform | wavesurfer.js 7.x | Best-in-class browser waveform + region editing |
| Audio render | FFmpeg (server-side, on freeze) | Runs once per clip lifetime |
| Hosting | Vercel Hobby | Free |
| **Total cost** | **$0/month** | |

---

## Project Structure

```
Odio/
  odio-web/                 ← Next.js app (to be scaffolded)
  feature.json              ← root LAC feature
  CLAUDE.md                 ← project guide for Claude Code
  lac.config.json           ← LAC config
  feat-app-shell/           ← PWA shell, navigation, dark theme
  feat-auth/                ← NextAuth.js + Google OAuth
  feat-recording/           ← MediaRecorder, stamps, Next Song flow
  feat-session-mgmt/        ← session + clip CRUD, naming, stages
  feat-versioning/          ← version chain, freeze, prune
  feat-timeline-editor/     ← wavesurfer.js, cut regions, submit
  feat-render/              ← server-side FFmpeg, public share link
  feat-band-space/          ← band creation, invites, Drive folder
  feat-collaboration/       ← votes, comments, heat map, activity
  feat-storage-mgmt/        ← Drive quota, post-freeze cleanup
```

---

## Key Concepts

### Sessions and Clips
A **session** is one jam night. A session contains multiple **clips** — one per song played. Clips are auto-named ("Song 1 · 9:41pm") and renameable by anyone in the band. Each clip has a **song stage** (idea / sketch / developing / demo-ready) that tracks the song's progress across sessions, separate from whether a recording is frozen.

### Versioning
Every clip starts with **v1** — the raw recording, no edits. Any band member can open a clip and submit a new version by marking cut regions (sections to remove). The version stores only the cut instructions + annotations, not a new audio file. **Freeze** converts the final version into a real rendered audio file. Older versions can be pruned. v1 cannot be deleted while any other version exists.

### Stamps
During recording, the recorder can stamp moments with:
- 🔥 Fire — something great just happened
- ⭐ Keep — this section is worth keeping
- ❓ Uncertain — discuss this
- 💡 Idea — this sparked something

Stamps appear on the waveform as colored markers during editing and playback. Multiple members' stamps aggregate into a heat map.

### Google Drive
Audio files live in the recorder's Google Drive, in a shared band folder. Odio uses `drive.file` scope — it only accesses files it created. Band members are added to the Drive folder share by the recorder. All structured metadata (sessions, clips, versions, votes, comments) lives in Postgres — not in Drive files.

---

## Development

```bash
# (once scaffolded)
cd odio-web
npm install
npm run dev
```

Planning artifacts: `../bmad/_bmad-output/odio/`
- `brainstorming-2026-04-10.md`
- `brainstorming-depth-2026-04-10.md`
- `prd.md`
- `architecture.md`
- `epics.md`
