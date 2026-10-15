import { NextIntlClientProvider } from "next-intl";
import type { ReactNode } from "react";
import { loadMessages, type Namespace } from "@/i18n/request";
import type { Locale } from "@/i18n/routing";

const BASE: Namespace[] = ["common", "mode", "errors"];

/** Ship only the namespaces a page's client components need. */
export async function ClientMessages({ locale, ns, children }: { locale: string; ns: Namespace[]; children: ReactNode }) {
  const messages = await loadMessages(locale as Locale, [...BASE, ...ns]);
  return (
    <NextIntlClientProvider locale={locale} messages={messages} timeZone="Asia/Bangkok">
      {children}
    </NextIntlClientProvider>
  );
}
