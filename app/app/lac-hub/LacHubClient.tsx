"use client";

import { LacHub } from "@majeanson/lac-react";

export function LacHubClient() {
  return (
    <LacHub
      dataUrl="/lac/lac-data.json"
      guideUrl="/lac/lac-guide.html"
      defaultTab="sprint"
      height="calc(100dvh - 120px)"
      style={{ minHeight: 400 }}
    />
  );
}
