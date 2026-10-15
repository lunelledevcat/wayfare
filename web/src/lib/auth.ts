import "server-only";
import type { NextAuthOptions } from "next-auth";
import { getServerSession } from "next-auth";
import GoogleProvider from "next-auth/providers/google";
import { recordLogin } from "./users";

/** Login is active only when Google credentials are configured. */
export const authConfigured = () => !!(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET && process.env.NEXTAUTH_SECRET);

export const authOptions: NextAuthOptions = {
  providers: [
    GoogleProvider({
      clientId: process.env.GOOGLE_CLIENT_ID ?? "",
      clientSecret: process.env.GOOGLE_CLIENT_SECRET ?? "",
    }),
  ],
  session: { strategy: "jwt", maxAge: 30 * 24 * 3600 },
  pages: { signIn: "/login", error: "/login" },
  callbacks: {
    /** Keep the Google account id on the token and expose it on the session. */
    async jwt({ token, account }) {
      if (account?.providerAccountId) token.googleId = account.providerAccountId;
      return token;
    },
    async session({ session, token }) {
      if (session.user && token.googleId) session.user.googleId = token.googleId as string;
      return session;
    },
  },
  events: {
    /** Upsert into Cloudflare D1 after each successful Google login. */
    async signIn({ user, account }) {
      if (account?.provider !== "google" || !user.email) return;
      await recordLogin({ googleId: account.providerAccountId, email: user.email, name: user.name, image: user.image });
    },
  },
};

/** Server-side session for pages and route handlers. */
export const getSession = () => getServerSession(authOptions);
