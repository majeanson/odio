// Temporary diagnostic page — shows the exact NextAuth error code so we can
// debug the sign-in loop. Remove once auth is stable.

export default async function AuthErrorPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const { error } = await searchParams;
  return (
    <div className="flex min-h-svh flex-col items-center justify-center bg-base text-primary px-6">
      <div className="w-full max-w-sm space-y-6 text-center">
        <h1 className="font-display text-3xl font-black text-primary tracking-tight">Sign-in error</h1>
        <p className="font-mono text-sm text-muted bg-surface rounded-xl px-4 py-3">
          {error ?? "(no error code)"}
        </p>
        <a
          href="/login"
          className="inline-flex items-center gap-2 rounded-2xl bg-accent px-6 py-5 text-base font-bold text-[#080808] hover:bg-amber-400 transition-colors"
        >
          Back to login
        </a>
      </div>
    </div>
  );
}
