import { NextResponse } from "next/server";
import path from "path";
import fs from "fs/promises";

// Serve pre-generated LAC HTML views from lac-views/ directory.
// Files are committed to the repo and included via outputFileTracingIncludes.
// No authentication required — proxy.ts excludes /lac/* from auth checks.

const VIEWS_DIR = path.join(process.cwd(), "lac-views");

// Allow only known filenames — no path traversal
const ALLOWED = new Set([
  "index.html",
  "lac-guide.html",
  "lac-wiki.html",
  "lac-kanban.html",
  "lac-decisions.html",
  "lac-graph.html",
  "lac-health.html",
  "lac-heatmap.html",
  "lac-print.html",
  "lac-raw.html",
  "lac-story.html",
]);

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ path: string[] }> },
) {
  const { path: segments } = await params;
  const filename = segments.join("/");

  if (!ALLOWED.has(filename)) {
    return new NextResponse("Not Found", { status: 404 });
  }

  try {
    const html = await fs.readFile(path.join(VIEWS_DIR, filename), "utf-8");
    return new NextResponse(html, {
      headers: { "Content-Type": "text/html; charset=utf-8" },
    });
  } catch {
    return new NextResponse("Not Found", { status: 404 });
  }
}
