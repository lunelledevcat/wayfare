import { Wallet } from "lucide-react";
import { useTranslations } from "next-intl";
import { Suspense, type ReactNode } from "react";
import { Link } from "@/i18n/navigation";
import { LocaleSwitcher } from "./locale-switcher";
import { Logo } from "./logo";
import { MegaMenu } from "./mega-menu";

/** Site header. Pages that load wallet providers pass a live connect button in `wallet`. */
export function Header({ wallet }: { wallet?: ReactNode }) {
  const t = useTranslations("common");
  return (
    <header className="sticky top-0 z-40 border-b border-border bg-card/90 backdrop-blur">
      <div className="mx-auto flex h-16 max-w-7xl items-center gap-3 px-4">
        <Link href="/" className="shrink-0 rounded-lg" aria-label="Wayfare">
          <Logo />
        </Link>
        <nav className="ml-4 hidden items-center gap-1 md:flex" aria-label={t("mainNav")}>
          <MegaMenu />
          <Link href="/operator" className="rounded-xl px-3 py-2 text-sm font-medium text-fg hover:bg-bg">
            {t("operators")}
          </Link>
          <Link href="/about-data" className="rounded-xl px-3 py-2 text-sm font-medium text-fg hover:bg-bg">
            {t("aboutData")}
          </Link>
        </nav>
        <div className="ml-auto flex items-center gap-2">
          <Suspense fallback={<div className="h-10 w-24" />}>
            <LocaleSwitcher className="hidden sm:inline-flex" />
          </Suspense>
          {wallet ?? (
            <Link
              href="/app"
              className="inline-flex h-10 items-center gap-2 rounded-xl bg-primary px-4 text-sm font-semibold text-white shadow-soft hover:bg-primary-strong"
            >
              <Wallet className="size-4" aria-hidden />
              {t("connectWallet")}
            </Link>
          )}
        </div>
      </div>
    </header>
  );
}
