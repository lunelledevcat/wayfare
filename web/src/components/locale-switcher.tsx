"use client";

import { Globe } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { useSearchParams } from "next/navigation";
import { useTransition } from "react";
import { usePathname, useRouter } from "@/i18n/navigation";
import { localeNames, locales, type Locale } from "@/i18n/routing";

/** Language picker: names in their own script, remembers choice in a cookie, keeps the current page. */
export function LocaleSwitcher({ className }: { className?: string }) {
  const locale = useLocale();
  const t = useTranslations("common");
  const router = useRouter();
  const pathname = usePathname();
  const search = useSearchParams();
  const [pending, start] = useTransition();
  return (
    <label className={`relative inline-flex items-center gap-1 ${className ?? ""}`}>
      <Globe className="pointer-events-none absolute left-2.5 size-4 text-muted" aria-hidden />
      <span className="sr-only">{t("language")}</span>
      <select
        value={locale}
        disabled={pending}
        onChange={(e) => {
          const next = e.target.value as Locale;
          const qs = search.toString();
          start(() => router.replace(qs ? `${pathname}?${qs}` : pathname, { locale: next }));
        }}
        className="h-10 appearance-none rounded-xl border border-border bg-card pl-8 pr-3 text-sm font-medium text-fg hover:bg-bg"
      >
        {locales.map((l) => (
          <option key={l} value={l} lang={l}>
            {localeNames[l]}
          </option>
        ))}
      </select>
    </label>
  );
}
