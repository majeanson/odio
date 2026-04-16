// /lac-hub — live LAC project hub for Odio
// Publicly accessible (no auth required) — reads /lac/lac-data.json (static file).
// Accessible from the static /lac/index.html "Open Live Hub →" button.

import Link from "next/link";
import { LacHubClient } from "./LacHubClient";

export const metadata = {
  title: "LAC Hub — Odio",
  description:
    "Sprint board, feature guide, decisions, and success tracking — auto-generated from Odio feature.jsons",
};

export default function LacHubPage() {
  return (
    <div
      style={{
        minHeight: "100dvh",
        background: "#09090b",
        color: "#e4e4e7",
        fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
      }}
    >
      {/* Topbar */}
      <div
        style={{
          height: 46,
          display: "flex",
          alignItems: "center",
          gap: 12,
          padding: "0 16px",
          background: "#0b0a08",
          borderBottom: "1px solid #262018",
          position: "sticky",
          top: 0,
          zIndex: 10,
        }}
      >
        <Link
          href="/bands"
          style={{
            fontSize: 12,
            color: "#71717a",
            textDecoration: "none",
            display: "flex",
            alignItems: "center",
            gap: 4,
          }}
        >
          ← App
        </Link>
        <span style={{ color: "#3f3f46" }}>|</span>
        <span
          style={{
            fontFamily: "monospace",
            fontSize: 12,
            color: "#f59e0b",
            letterSpacing: "0.05em",
          }}
        >
          lac·hub
        </span>
        <span style={{ fontSize: 12, color: "#52525b" }}>Odio</span>
        <a
          href="/lac/index.html"
          style={{
            marginLeft: "auto",
            fontSize: 11,
            color: "#71717a",
            textDecoration: "none",
          }}
        >
          HTML docs →
        </a>
      </div>

      {/* Hub */}
      <div style={{ padding: "12px 12px 0" }}>
        <LacHubClient />
      </div>
    </div>
  );
}
