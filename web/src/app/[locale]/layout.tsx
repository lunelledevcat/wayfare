import type { Metadata, Viewport } from "next";
import { IBM_Plex_Sans_Thai } from "next/font/google";
import { notFound } from "next/navigation";
import { hasLocale, NextIntlClientProvider } from "next-intl";
import { getTranslations, setRequestLocale } from "next-intl/server";
import type { ReactNode } from "react";
import { AuthProvider } from "@/components/auth-provider";
import { PrefsProvider } from "@/components/prefs";
import { MotionProvider } from "@/components/ui/motion";
import { loadMessages } from "@/i18n/request";
import { routing, type Locale } from "@/i18n/routing";

const thai = IBM_Plex_Sans_Thai({ subsets: ["thai", "latin"], weight: ["400", "500", "600", "700"], variable: "--font-thai", display: "swap" });

export function generateStaticParams() {
  return routing.locales.map((locale) => ({ locale }));
}

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "common" });
  return {
    title: { default: t("meta.title"), template: "%s · Wayfare" },
    description: t("meta.description"),
    manifest: "/manifest.webmanifest",
    icons: { icon: "/icon.svg", apple: "/icon-192.png" },
    appleWebApp: { capable: true, title: "Wayfare", statusBarStyle: "default" },
  };
}

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#1463ff" },
    { media: "(prefers-color-scheme: dark)", color: "#0b0f17" },
  ],
  width: "device-width",
  initialScale: 1,
};

export default async function LocaleLayout({ children, params }: { children: ReactNode; params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  if (!hasLocale(routing.locales, locale)) notFound();
  setRequestLocale(locale);
  // only the namespaces every page needs on the client; pages add their own
  const messages = await loadMessages(locale as Locale, ["common", "mode", "errors"]);
  return (
    <html lang={locale} className={thai.variable}>
      <body className="min-h-dvh antialiased">
        <NextIntlClientProvider locale={locale} messages={messages} timeZone="Asia/Bangkok">
          <AuthProvider>
            <PrefsProvider>
              <MotionProvider>{children}</MotionProvider>
            </PrefsProvider>
          </AuthProvider>
        </NextIntlClientProvider>
      </body>
    </html>
  );
}
