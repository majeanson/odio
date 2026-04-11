// Authenticated layout — wraps all band-facing routes.
// Verifies session server-side, then mounts the client-side AuthShell
// which renders the BottomTabBar and manages pending upload recovery.

import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import { AuthShell } from "@/components/layout/AuthShell";

export default async function AuthLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await auth();
  if (!session?.user) redirect("/login");

  return <AuthShell>{children}</AuthShell>;
}
