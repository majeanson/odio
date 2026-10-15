// Canned data for the public /apercu demo. One synthetic jam (public/demo/
// jam.mp3, generated — no license baggage) shared by three "clips", each with
// its own stamps and version chain, so the demo exercises the real player:
// stamp jumping, cut masking, version switching. Nothing here touches Prisma,
// Drive or any API route.

import type { CutMark, Stamp, StampType } from "@/types";

export const DEMO_AUDIO_URL = "/demo/jam.mp3";
export const DEMO_DURATION_MS = 72_000;

export interface DemoVersion {
  id: string;
  versionNumber: number;
  description: string;
  cutMarks: CutMark[];
  /** Static vote tallies for display — the demo has no live voting. */
  votes: { KEEP: number; REVISE: number; PASS: number };
}

export interface DemoClip {
  id: string;
  name: string;
  recordedBy: string;
  stamps: Stamp[];
  versions: DemoVersion[];
}

function stamp(id: string, clipId: string, timestampMs: number, type: StampType): Stamp {
  return {
    id,
    clipId,
    timestampMs,
    type,
    createdBy: "demo@odio.app",
    createdAt: "2026-10-09T01:12:00.000Z",
  };
}

export const DEMO_SESSION = {
  name: "Thursday jam",
  date: "Oct 8, 2026",
  band: "The Demo Band",
};

export const DEMO_CLIPS: DemoClip[] = [
  {
    id: "demo-riff-in-e",
    name: "Riff in E",
    recordedBy: "demo@odio.app",
    stamps: [
      stamp("st-1", "demo-riff-in-e", 12_400, "FIRE"),
      stamp("st-2", "demo-riff-in-e", 31_200, "KEEP"),
      stamp("st-3", "demo-riff-in-e", 58_000, "IDEA"),
    ],
    versions: [
      {
        id: "demo-riff-v2",
        versionNumber: 2,
        description: "Tightened the intro, dropped the loose middle",
        cutMarks: [
          { startMs: 0, endMs: 8_200 },
          { startMs: 42_500, endMs: 51_000 },
        ],
        votes: { KEEP: 2, REVISE: 1, PASS: 0 },
      },
      {
        id: "demo-riff-v1",
        versionNumber: 1,
        description: "Raw take, straight off the room mic",
        cutMarks: [],
        votes: { KEEP: 1, REVISE: 2, PASS: 0 },
      },
    ],
  },
  {
    id: "demo-bridge-idea",
    name: "Bridge idea",
    recordedBy: "demo@odio.app",
    stamps: [
      stamp("st-4", "demo-bridge-idea", 20_000, "UNCERTAIN"),
      stamp("st-5", "demo-bridge-idea", 44_000, "FIRE"),
    ],
    versions: [
      {
        id: "demo-bridge-v1",
        versionNumber: 1,
        description: "Might be the bridge. Might be nothing.",
        cutMarks: [],
        votes: { KEEP: 1, REVISE: 0, PASS: 2 },
      },
    ],
  },
  {
    id: "demo-last-take",
    name: "Last take of the night",
    recordedBy: "demo@odio.app",
    stamps: [
      stamp("st-6", "demo-last-take", 5_000, "KEEP"),
      stamp("st-7", "demo-last-take", 36_800, "FIRE"),
      stamp("st-8", "demo-last-take", 66_000, "IDEA"),
    ],
    versions: [
      {
        id: "demo-last-v2",
        versionNumber: 2,
        description: "Cut the false start",
        cutMarks: [{ startMs: 0, endMs: 6_500 }],
        votes: { KEEP: 3, REVISE: 0, PASS: 0 },
      },
      {
        id: "demo-last-v1",
        versionNumber: 1,
        description: "Everyone was tired. It shows, in a good way.",
        cutMarks: [],
        votes: { KEEP: 1, REVISE: 1, PASS: 1 },
      },
    ],
  },
];
