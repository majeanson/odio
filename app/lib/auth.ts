import NextAuth from "next-auth";
import Google from "next-auth/providers/google";
import { PrismaAdapter } from "@auth/prisma-adapter";
import { prisma } from "@/lib/prisma";

// NextAuth v5 configuration
// DB adapter is REQUIRED (not optional) — we need the accounts table to store
// the band creator's refresh_token for the audio proxy and upload routes.
// JWT-only strategy is explicitly rejected for this reason.

export const { handlers, auth, signIn, signOut } = NextAuth({
  adapter: PrismaAdapter(prisma),
  providers: [
    Google({
      clientId: process.env.GOOGLE_CLIENT_ID!,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET!,
      authorization: {
        params: {
          scope: [
            "openid",
            "email",
            "profile",
            // drive: full read/write to all Drive files.
            // drive.file alone restricts files.list to app-created files only —
            // that filter persists even when drive.readonly is also present.
            // drive scope is required to list and stream files the user copied
            // into the band folder manually from outside Odio.
            "https://www.googleapis.com/auth/drive",
          ].join(" "),
          access_type: "offline",  // needed to receive a refresh_token
          prompt: "consent",       // forces refresh_token on every consent
        },
      },
    }),
  ],
  session: {
    strategy: "database", // required — stores session in Postgres via PrismaAdapter
  },
  pages: {
    signIn: "/login",
    error: "/auth-error",
  },
  callbacks: {
    // On every sign-in, update the stored OAuth tokens so the Drive access
    // token stays current. The PrismaAdapter doesn't do this automatically
    // on repeat sign-ins, so old tokens (missing drive.file scope) persist.
    async signIn({ user, account }) {
      if (account?.provider === "google" && user.id) {
        await prisma.account.updateMany({
          where: { userId: user.id, provider: "google" },
          data: {
            access_token: account.access_token,
            refresh_token: account.refresh_token ?? undefined,
            expires_at: account.expires_at,
            scope: account.scope,
          },
        });
      }
      return true;
    },
    // Expose the user's email and id on the session object
    async session({ session, user }) {
      if (session.user) {
        session.user.id = user.id;
      }
      return session;
    },
  },
});
