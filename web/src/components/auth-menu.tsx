"use client";

import { LogIn, LogOut } from "lucide-react";
import { signOut, useSession } from "next-auth/react";
import { useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import { Popover, PopoverContent, PopoverTrigger } from "./ui/popover";

/** Navbar account control: "Login" link, or avatar + menu with the Google account and logout. */
export function AuthMenu() {
  const t = useTranslations("common.auth");
  const { data: session, status } = useSession();

  if (status === "loading") return <span className="inline-block h-11 w-11" aria-hidden />;

  if (!session?.user) {
    return (
      <Link href="/login" className="press inline-flex h-11 items-center gap-2 rounded-xl border border-border bg-card px-3 text-sm font-semibold text-fg hover:bg-subtle" aria-label={t("login")}>
        <LogIn className="size-4" aria-hidden />
        <span className="hidden md:inline">{t("login")}</span>
      </Link>
    );
  }

  const name = session.user.name ?? session.user.email ?? "";
  return (
    <Popover>
      <PopoverTrigger className="press flex h-11 items-center gap-2 rounded-xl border border-border bg-card pl-1 pr-2 hover:bg-subtle" aria-label={t("account", { name })}>
        {session.user.image ? (
          // Google avatar URLs are not on Next's image allow-list, so a plain <img> is intentional
          // eslint-disable-next-line @next/next/no-img-element
          <img src={session.user.image} alt="" width={36} height={36} referrerPolicy="no-referrer" className="size-9 rounded-lg object-cover" />
        ) : (
          <span className="flex size-9 items-center justify-center rounded-lg bg-primary-soft text-sm font-bold text-primary">{name.slice(0, 1).toUpperCase()}</span>
        )}
      </PopoverTrigger>
      <PopoverContent align="end" className="w-64">
        <p className="truncate font-semibold">{session.user.name}</p>
        <p className="truncate text-sm text-muted">{session.user.email}</p>
        <button
          type="button"
          onClick={() => signOut({ callbackUrl: "/" })}
          className="press mt-3 flex min-h-11 w-full items-center justify-center gap-2 rounded-xl bg-subtle text-sm font-semibold hover:bg-primary-soft hover:text-primary"
        >
          <LogOut className="size-4" aria-hidden />
          {t("logout")}
        </button>
      </PopoverContent>
    </Popover>
  );
}
