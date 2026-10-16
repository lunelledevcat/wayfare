import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { ClientMessages } from "@/components/client-messages";
import { Footer } from "@/components/footer";
import { Header } from "@/components/header";
import { PlanView } from "@/components/plan-view";
import { SearchBox } from "@/components/search-box";
import { SourceList } from "@/components/source-list";
import { Card } from "@/components/ui/primitives";
import { carFromParams } from "@/lib/car";
import { dayLabel, pick } from "@/lib/format";
import { plan, PlanError } from "@/lib/planner/plan";
import { PRIORITIES, type Mode, type PlanResult, type Priority } from "@/lib/planner/types";
import { resolvePlace } from "@/lib/providers/places";
import { bkkTime } from "@/lib/time";

// results depend on the query string — never prerender
export const dynamic = "force-dynamic";

type SP = Record<string, string | string[] | undefined>;
const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) ?? "";

export async function generateMetadata({ params, searchParams }: { params: Promise<{ locale: string }>; searchParams: Promise<SP> }): Promise<Metadata> {
  const { locale } = await params;
  const sp = await searchParams;
  const from = resolvePlace(one(sp.from));
  const to = resolvePlace(one(sp.to));
  const t = await getTranslations({ locale, namespace: "plan" });
  return { title: from && to ? t("title", { from: pick(from.name, locale), to: pick(to.name, locale) }) : t("newSearch"), robots: { index: false } };
}

export default async function PlanPage({ params, searchParams }: { params: Promise<{ locale: string }>; searchParams: Promise<SP> }) {
  const { locale } = await params;
  setRequestLocale(locale);
  const sp = await searchParams;
  const t = await getTranslations({ locale, namespace: "plan" });
  const te = await getTranslations({ locale, namespace: "errors" });
  const query = { from: one(sp.from), to: one(sp.to), date: one(sp.date), time: one(sp.time), mode: one(sp.mode) === "arrive" ? ("arrive" as const) : ("depart" as const), pax: Number(one(sp.pax)) || 1, car: carFromParams(sp) };
  const priority = PRIORITIES.includes(one(sp.priority) as Priority) ? (one(sp.priority) as Priority) : undefined;
  const modes = one(sp.modes) ? (one(sp.modes).split(",") as Mode[]) : undefined;

  let result: PlanResult | null = null;
  let error: string | null = null;
  try {
    result = await plan(query);
    if (result.trips.length === 0) error = te("noTrips");
  } catch (err) {
    error = err instanceof PlanError ? te(err.code) : te("generic");
    if (!(err instanceof PlanError)) console.error("[plan page]", err);
  }

  const from = resolvePlace(query.from);
  const to = resolvePlace(query.to);
  const init = {
    from: from ? { token: query.from, label: pick(from.name, locale) } : null,
    to: to ? { token: query.to, label: pick(to.name, locale) } : null,
    date: result?.query.date ?? query.date,
    time: result?.query.time ?? query.time,
    mode: query.mode,
    pax: result?.query.pax ?? query.pax,
    car: result?.query.car ?? query.car,
  };

  return (
    <ClientMessages locale={locale} ns={["search", "plan", "msg"]}>
      <Header />
      <main className="mx-auto max-w-7xl px-4 py-5">
        <div className="mb-4">
          {result && from && to && (
            <div className="mb-3">
              <h1 className="text-2xl font-extrabold md:text-3xl">{t("title", { from: pick(from.name, locale), to: pick(to.name, locale) })}</h1>
              <p className="mt-1 text-muted">
                {t("summary", {
                  date: dayLabel(bkkTime(result.query.date), locale, { weekday: "long", day: "numeric", month: "long" }),
                  mode: result.query.mode,
                  time: result.query.time,
                  pax: result.query.pax,
                })}
              </p>
            </div>
          )}
          <details className="group" open={!result}>
            <summary className="mb-3 inline-flex min-h-10 cursor-pointer list-none items-center rounded-xl border border-border bg-card px-3 text-sm font-semibold text-primary hover:bg-primary-soft">{t("edit")}</summary>
            <SearchBox init={init} compact priority={priority} />
          </details>
        </div>
        {error && (
          <Card className="p-6" role="alert">
            <p className="text-lg font-bold">{t("errorTitle")}</p>
            <p className="mt-1 text-muted">{error}</p>
          </Card>
        )}
        {result && result.trips.length > 0 && (
          <>
            <PlanView result={result} initialPriority={priority} initialModes={modes} />
            <SourceList sources={result.sources} title={t("sources")} />
          </>
        )}
      </main>
      <Footer />
    </ClientMessages>
  );
}
