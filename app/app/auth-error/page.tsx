// Temporary diagnostic page — shows the exact NextAuth error code so we can
// debug the sign-in loop. Remove once auth is stable.

export default async function AuthErrorPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const { error } = await searchParams;
  return (
    <div style={{ fontFamily: "monospace", padding: 32 }}>
      <h1>Auth error</h1>
      <p>
        <strong>error=</strong> {error ?? "(none)"}
      </p>
      <p style={{ marginTop: 16 }}>
        <a href="/login">← Back to login</a>
      </p>
    </div>
  );
}
