import { getToken } from "next-auth/jwt";
import createMiddleware from "next-intl/middleware";
import { NextResponse, type NextRequest } from "next/server";
import { routing } from "./i18n/routing";

const intl = createMiddleware(routing);

/** Pages that need a signed-in Google user (the passenger app: trips, tickets, profile). */
const PROTECTED = new RegExp(`^/(${routing.locales.join("|")})/app(/|$)`);

/** Login is only enforced when Google sign-in is configured, so a fresh clone still runs. */
const loginEnforced = () => !!(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET && process.env.NEXTAUTH_SECRET);

export default async function middleware(req: NextRequest) {
  const { pathname, search } = req.nextUrl;
  const match = PROTECTED.exec(pathname);
  if (match && loginEnforced()) {
    const token = await getToken({ req });
    if (!token) {
      const url = req.nextUrl.clone();
      url.pathname = `/${match[1]}/login`;
      url.search = `?callbackUrl=${encodeURIComponent(pathname + search)}`;
      return NextResponse.redirect(url);
    }
  }
  return intl(req);
}

export const config = {
  // everything except API routes, Next internals and static files
  matcher: ["/((?!api|_next|_vercel|.*\\..*).*)"],
};
