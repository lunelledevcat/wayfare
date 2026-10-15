import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { Footer } from "@/components/footer";
import { Header } from "@/components/header";
import { TripDetail } from "@/components/trip-detail";
import { Card } from "@/components/ui/primitives";
import { WalletButton } from "@/components/wallet/connect-button";
import { Link } from "@/i18n/navigation";
import { pick } from "@/lib/format";
import { findTrip, normalizeQuery } from "@/lib/planner/plan";
import { resolvePlace } from "@/lib/providers/places";

type SP = Record<string, string | string[] | undefined>;
const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) ?? "";

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "trip" });
  return { title: t("timeline"), robots: { index: false } };
}

export default async function TripPage({ params, searchParams }: { params: Promise<{ locale: string; id: string }>; searchParams: Promise<SP> }) {
  const { locale, id } = await params;
  setRequestLocale(locale);
  const sp = await searchParams;
  const t = await getTranslations({ locale, namespace: "trip" });
  const query = normalizeQuery({ from: one(sp.from), to: one(sp.to), date: one(sp.date), time: one(sp.time), mode: one(sp.mode) === "arrive" ? "arrive" : "depart", pax: Number(one(sp.pax)) || 1 });
  let found: Awaited<ReturnType<typeof findTrip>> = null;
  try {
    found = await findTrip(id, query.from && query.to ? query : undefined);
  } catch (err) {
    console.error("[trip page]", err);
  }
  const back = `/plan?${new URLSearchParams({ from: query.from, to: query.to, date: query.date, time: query.time, mode: query.mode, pax: String(query.pax), ...(one(sp.priority) ? { priority: one(sp.priority) } : {}) })}`;
  const from = resolvePlace(query.from);
  const to = resolvePlace(query.to);

  return (
    <>
      <Header wallet={<WalletButton />} />
      <main className="mx-auto max-w-7xl px-4 py-5">
        {found ? (
          <TripDetail trip={found.trip} query={found.query} backHref={back} fromName={from ? pick(from.name, locale) : ""} toName={to ? pick(to.name, locale) : ""} />
        ) : (
          <Card className="p-8 text-center">
            <p className="font-semibold">{t("notFound")}</p>
            <Link href={back} className="mt-4 inline-flex h-12 items-center rounded-xl bg-primary px-5 font-semibold text-on-primary">
              {t("back")}
            </Link>
          </Card>
        )}
      </main>
      <Footer />
    </>
  );
}
