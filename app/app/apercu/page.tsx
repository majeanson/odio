// /apercu — public read-only demo. No auth, no Prisma, no Drive: the page
// lives outside app/(auth) so the layout's redirect never applies, and
// proxy.ts excludes it from the session-cookie check. It exists for the
// marcportal.com project gallery, whose card iframes this app — without it,
// an anonymous visitor only ever saw the login redirect.

import type { Metadata } from "next";
import { ApercuClient } from "@/components/apercu/ApercuClient";

export const metadata: Metadata = {
  title: "Odio — public demo",
  description:
    "A session recorder for band jams: record, stamp the good moments, trim on the waveform, version the takes. Canned demo, no account needed.",
};

export default function ApercuPage() {
  return <ApercuClient />;
}
