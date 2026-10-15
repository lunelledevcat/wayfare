"use client";

import { Globe } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { useSearchParams } from "next/navigation";
import { useTransition } from "react";
import { usePathname, useRouter } from "@/i18n/navigation";
import { localeNames, locales, type Locale } from "@/i18n/routing";
import { cn } from "@/lib/utils";
import { Select } from "./ui/select";

/** Language picker: names in their own script, remembers choice in a cookie, keeps the current page. */
export function LocaleSwitcher({ className }: { className?: string }) {
  const locale = useLocale();
  const t = useTranslations("common");
  const router = useRouter();
  const pathname = usePathname();
  const search = useSearchParams();
  const [pending, start] = useTransition();
  return (
    <Select
      ariaLabel={t("language")}
      value={locale}
      disabled={pending}
      className={cn("w-auto min-w-[7.5rem]", className)}
      icon={<Globe className="size-4 text-muted" aria-hidden />}
      onValueChange={(next) => {
        const qs = search.toString();
        start(() => router.replace(qs ? `${pathname}?${qs}` : pathname, { locale: next as Locale }));
      }}
      options={locales.map((l) => ({ value: l, label: localeNames[l], text: localeNames[l], lang: l }))}
    />
  );
}
