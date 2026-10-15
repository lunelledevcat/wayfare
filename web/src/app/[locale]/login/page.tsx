import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { connection } from "next/server";
import { Suspense } from "react";
import { Footer } from "@/components/footer";
import { Header } from "@/components/header";
import { LoginCard } from "@/components/login-card";
import { Skeleton } from "@/components/ui/primitives";
import { authConfigured } from "@/lib/auth";


export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "common.auth" });
  return { title: t("title"), robots: { index: false } };
}

export default async function LoginPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  setRequestLocale(locale);
  // opt into request-time rendering so the "not configured" notice reflects the live environment
  await connection();
  return (
    <>
      <Header />
      <main className="mx-auto flex min-h-[60vh] max-w-7xl items-center px-4 py-10">
        <Suspense fallback={<Skeleton className="mx-auto h-72 w-full max-w-md" />}>
          <LoginCard configured={authConfigured()} />
        </Suspense>
      </main>
      <Footer />
    </>
  );
}
