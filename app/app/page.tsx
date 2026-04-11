// Root route — always redirect to /bands.
// The /bands page handles the multi-band home, single-band fast-path, and first-run.

import { redirect } from "next/navigation";

export default function RootPage() {
  redirect("/bands");
}
