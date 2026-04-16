// /lac-hub — LAC project hub for Odio
// Embedded documentation + sprint board powered by @majeanson/lac-react.
// Reads /lac/lac-data.json (generated at build time by `lac export --all`).

import { PageLayout } from "@/components/layout/PageLayout";
import { LacHubClient } from "./LacHubClient";

export const metadata = {
  title: "LAC Hub — Odio",
  description: "Feature documentation, sprint board, decisions, and success criteria for Odio",
};

export default function LacHubPage() {
  return (
    <PageLayout title="LAC Hub">
      <div className="px-4 pb-6 pt-2">
        <div className="mb-4">
          <p className="text-sm text-zinc-400">
            55 features · auto-generated from feature.jsons ·{" "}
            <a href="/lac/index.html" target="_blank" rel="noreferrer" className="text-amber-400 hover:text-amber-300">
              Full docs →
            </a>
          </p>
        </div>
        <LacHubClient />
      </div>
    </PageLayout>
  );
}
