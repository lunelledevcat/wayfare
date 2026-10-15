import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { Suspense } from "react";
import { AppShell } from "@/components/app/app-shell";
import { ListSkeleton } from "@/components/app/states";
import { Header } from "@/components/header";
import { WalletButton } from "@/components/wallet/connect-button";
import { routing } from "@/i18n/routing";

export function generateStaticParams() {
  return routing.locales.map((locale) => ({ locale }));
}

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "app" });
  return { title: t("meta.title"), robots: { index: false } };
}

export default async function AppPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  setRequestLocale(locale);
  return (
    <>
      <Header wallet={<WalletButton />} />
      <Suspense
        fallback={
          <main className="mx-auto max-w-3xl px-4 pt-5">
            <ListSkeleton />
          </main>
        }
      >
        <AppShell />
      </Suspense>
    </>
  );
}
