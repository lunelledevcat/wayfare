"use client";

import { SessionProvider } from "next-auth/react";
import type { ReactNode } from "react";

/** next-auth session context for the whole app (does not refetch on window focus to keep pages quiet). */
export function AuthProvider({ children }: { children: ReactNode }) {
  return <SessionProvider refetchOnWindowFocus={false}>{children}</SessionProvider>;
}
