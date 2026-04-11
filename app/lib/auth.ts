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
            // drive.file: access only to files Odio creates in the user's Drive
            "https://www.googleapis.com/auth/drive.file",
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
  events: {
    async signIn({ user, account, isNewUser }) {
      console.log("[AUTH] signIn", { userId: user.id, provider: account?.provider, isNewUser });
    },
    async createSession({ session }) {
      console.log("[AUTH] createSession", { token: session.sessionToken.slice(0, 8) });
    },
    async session({ session }) {
      console.log("[AUTH] session", { userId: (session as { userId?: string }).userId });
    },
  },
  callbacks: {
    // Expose the user's email and id on the session object
    async session({ session, user }) {
      if (session.user) {
        session.user.id = user.id;
      }
      return session;
    },
  },
});
