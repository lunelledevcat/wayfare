import { hasLocale } from "next-intl";
import { getRequestConfig } from "next-intl/server";
import { routing, type Locale } from "./routing";

/** Message namespaces; each is one file per locale under messages/<locale>/<ns>.json. */
export const namespaces = ["common", "mode", "home", "search", "plan", "trip", "msg", "app", "operator", "about", "errors", "wallet"] as const;
export type Namespace = (typeof namespaces)[number];

export async function loadMessages(locale: Locale, ns: readonly Namespace[] = namespaces) {
  const entries = await Promise.all(
    ns.map(async (n) => {
      try {
        return [n, (await import(`../../messages/${locale}/${n}.json`)).default] as const;
      } catch {
        // missing namespace for this locale: fall back to English (or nothing)
        try {
          return [n, (await import(`../../messages/en/${n}.json`)).default] as const;
        } catch {
          return [n, {}] as const;
        }
      }
    }),
  );
  return Object.fromEntries(entries);
}

export default getRequestConfig(async ({ requestLocale }) => {
  const requested = await requestLocale;
  const locale = hasLocale(routing.locales, requested) ? requested : routing.defaultLocale;
  return { locale, messages: await loadMessages(locale), timeZone: "Asia/Bangkok" };
});
