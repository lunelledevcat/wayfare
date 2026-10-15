import NextAuth from "next-auth";
import { NextResponse, type NextRequest } from "next/server";
import { authConfigured, authOptions } from "@/lib/auth";

export const runtime = "nodejs";

const handler = NextAuth(authOptions);
type Ctx = Parameters<typeof handler>[1];

/**
 * Without Google credentials / NEXTAUTH_SECRET the app still works as a guest: the session
 * endpoint answers "nobody signed in" and everything else says login is not configured,
 * instead of next-auth failing with a 500 on every page load.
 */
async function route(req: NextRequest, ctx: Ctx) {
  if (authConfigured()) return handler(req, ctx);
  if (req.nextUrl.pathname.endsWith("/session")) return NextResponse.json({});
  return NextResponse.json({ error: "auth_not_configured" }, { status: 503 });
}

export { route as GET, route as POST };
