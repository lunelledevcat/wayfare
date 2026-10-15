import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { Footer } from "@/components/footer";
import { Header } from "@/components/header";
import { OperatorConsole } from "@/components/operator/operator-console";
import { WalletButton } from "@/components/wallet/connect-button";
import { routing } from "@/i18n/routing";

export function generateStaticParams() {
  return routing.locales.map((locale) => ({ locale }));
}

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "operator" });
  return { title: t("meta.title") };
}

export default async function OperatorPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  setRequestLocale(locale);
  return (
    <>
      <Header wallet={<WalletButton />} />
      <main className="mx-auto max-w-6xl px-4 py-6">
        <OperatorConsole />
      </main>
      <Footer />
    </>
  );
}
