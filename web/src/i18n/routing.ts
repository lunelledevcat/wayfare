import { defineRouting } from "next-intl/routing";

export const locales = ["th", "en", "zh", "ja"] as const;
export type Locale = (typeof locales)[number];

/** Language names written in their own script (no flags). */
export const localeNames: Record<Locale, string> = { th: "ไทย", en: "English", zh: "中文", ja: "日本語" };

export const routing = defineRouting({
  locales,
  defaultLocale: "th",
  localePrefix: "always",
  localeCookie: { name: "WAYFARE_LOCALE", maxAge: 60 * 60 * 24 * 365 },
});
