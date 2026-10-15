import { ArrowRight, Banknote, Check, CloudSun, Layers, QrCode, ScanLine, Search, SlidersHorizontal, Sparkles, Ticket, TriangleAlert, Trophy } from "lucide-react";
import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { ClientMessages } from "@/components/client-messages";
import { Footer } from "@/components/footer";
import { Header } from "@/components/header";
import { LandingStats } from "@/components/landing-stats";
import { ModeIcon } from "@/components/mode-icon";
import { SearchBox } from "@/components/search-box";
import { buttonVariants } from "@/components/ui/button";
import { Badge, Card } from "@/components/ui/primitives";
import { Link } from "@/i18n/navigation";
import { DEFAULT_TIME_VALUE } from "@/lib/config";
import { dayLabel, money, splitDuration } from "@/lib/format";
import { MENU, planHref, POPULAR } from "@/lib/menu";
import { plan } from "@/lib/planner/plan";
import { bestByPriority, DEFAULT_PREFS } from "@/lib/planner/scoring";
import type { Mode, Trip } from "@/lib/planner/types";
import { bkkDate, bkkTime, bkkWeekday, DAY } from "@/lib/time";
import { cn } from "@/lib/utils";

/** Regenerate a few times a day so the sample route and links stay current. */
export const revalidate = 21600;

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "home" });
  return { title: { absolute: t("meta.title") } };
}

const SAMPLE = { from: "p:asok", to: "c:chiangmai", time: "08:00" } as const;
const CARD_ORDER = ["cheapest", "fastest", "value"] as const;
type CardKind = (typeof CARD_ORDER)[number];

/** The coming Friday in Asia/Bangkok (a week ahead when today is Friday). */
function nextFriday(): string {
  const now = Date.now();
  const days = (4 - bkkWeekday(now) + 7) % 7 || 7;
  return bkkDate(now + days * DAY);
}

/** Run a real plan for the sample route at build / revalidate time. Returns null on any failure. */
async function sampleTrips() {
  const date = nextFriday();
  try {
    const res = await Promise.race([
      plan({ from: SAMPLE.from, to: SAMPLE.to, date, time: SAMPLE.time, mode: "depart", pax: 1 }),
      new Promise<never>((_, reject) => setTimeout(() => reject(new Error("timeout")), 25_000)),
    ]);
    const best = bestByPriority(res.trips, DEFAULT_PREFS);
    const cards = CARD_ORDER.map((kind) => ({ kind, trip: res.trips.find((t) => t.id === best[kind]) })).filter(
      (c): c is { kind: CardKind; trip: Trip } => !!c.trip,
    );
    return cards.length === CARD_ORDER.length ? { date, cards } : null;
  } catch {
    return null;
  }
}

/** Ride modes in order, without walking and without consecutive repeats. */
function modeStrip(trip: Trip): Mode[] {
  const out: Mode[] = [];
  for (const l of trip.legs) {
    if (l.mode === "walk" || l.kind !== "ride") continue;
    if (out[out.length - 1] !== l.mode) out.push(l.mode);
  }
  return out.length ? out : [trip.mainMode];
}

const VEHICLES = MENU.flatMap((g) => g.items);

const HIGHLIGHTS = [
  { key: "compare", icon: Layers },
  { key: "realtime", icon: Banknote },
  { key: "weather", icon: CloudSun },
] as const;

const STEPS = [
  { key: "search", icon: Search },
  { key: "priority", icon: SlidersHorizontal },
  { key: "best", icon: Trophy },
  { key: "book", icon: Ticket },
] as const;

export default async function HomePage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  setRequestLocale(locale);
  const [t, tc, tm, sample] = await Promise.all([
    getTranslations("home"),
    getTranslations("common"),
    getTranslations("mode"),
    sampleTrips(),
  ]);
  const duration = (min: number) => tc("duration", splitDuration(min));

  return (
    <>
      <Header />
      <main id="main">
        {/* Hero */}
        <section className="relative overflow-hidden bg-card">
          <div aria-hidden className="pointer-events-none absolute inset-0">
            <div className="absolute -right-24 -top-24 size-80 rounded-full bg-primary-soft" />
            <div className="absolute -bottom-32 -left-20 size-72 rounded-full bg-good-soft opacity-70" />
            <svg className="absolute right-6 top-10 hidden h-40 w-72 text-primary opacity-20 lg:block" viewBox="0 0 288 160" fill="none">
              <path d="M8 140 C 80 140, 70 30, 150 40 S 230 120, 280 20" stroke="currentColor" strokeWidth="4" strokeDasharray="10 10" strokeLinecap="round" />
              <circle cx="8" cy="140" r="8" fill="currentColor" />
              <circle cx="280" cy="20" r="8" fill="currentColor" />
            </svg>
          </div>
          <div className="relative mx-auto max-w-7xl px-4 pb-12 pt-10 md:pb-16 md:pt-16">
            <Badge tone="primary" className="px-3 py-1 text-sm">
              <Sparkles aria-hidden />
              {t("hero.badge")}
            </Badge>
            <h1 className="mt-4 max-w-3xl text-4xl font-extrabold leading-tight tracking-tight text-fg md:text-6xl">
              {t("hero.title")}
              <span className="block text-primary">{t("hero.titleAccent")}</span>
            </h1>
            <p className="mt-4 max-w-2xl text-base text-muted md:text-lg">{t("hero.subtitle")}</p>
            <div className="mt-8 max-w-5xl">
              <ClientMessages locale={locale} ns={["search"]}>
                <SearchBox />
              </ClientMessages>
            </div>
            <div className="mt-4 flex flex-wrap items-center gap-2">
              <span className="text-sm font-semibold text-muted">{t("hero.trySearch")}:</span>
              {POPULAR.map((p) => (
                <Link
                  key={p.key}
                  href={planHref(p.from, p.to)}
                  className="inline-flex min-h-12 items-center rounded-full border border-border bg-card px-4 text-sm font-medium text-fg hover:border-primary hover:text-primary"
                >
                  {tc(`popular.${p.key}`)}
                </Link>
              ))}
            </div>
          </div>
        </section>

        {/* Vehicle grid */}
        <section aria-labelledby="modes-title" className="mx-auto max-w-7xl px-4 py-12">
          <div className="flex flex-wrap items-end justify-between gap-2">
            <div>
              <h2 id="modes-title" className="text-2xl font-bold md:text-3xl">
                {t("modes.title")}
              </h2>
              <p className="mt-1 text-muted">{t("modes.subtitle")}</p>
            </div>
            <Link href="/about-data" className="inline-flex min-h-12 items-center gap-1 font-semibold text-primary hover:underline">
              {t("modes.seeMore")}
              <ArrowRight className="size-4" aria-hidden />
            </Link>
          </div>
          <ul className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
            {VEHICLES.map((v) => (
              <li key={v.key}>
                <Link
                  href={planHref(v.from, v.to, v.modes)}
                  className="flex h-full flex-col items-center gap-3 rounded-2xl border border-border bg-card p-4 text-center shadow-soft transition hover:-translate-y-0.5 hover:border-primary"
                >
                  <ModeIcon mode={v.mode} className="size-14 rounded-2xl" />
                  <span className="font-bold text-fg">{tc(`menu.${v.key}`)}</span>
                  <span className="text-xs text-muted">{t(`modes.hint.${v.key}`)}</span>
                </Link>
              </li>
            ))}
          </ul>
        </section>

        {/* Highlights */}
        <section aria-labelledby="hl-title" className="bg-card">
          <div className="mx-auto max-w-7xl px-4 py-12">
            <h2 id="hl-title" className="text-center text-2xl font-bold md:text-3xl">
              {t("highlights.title")}
            </h2>
            <ul className="mt-8 grid gap-6 md:grid-cols-3">
              {HIGHLIGHTS.map(({ key, icon: Icon }) => (
                <li key={key} className="flex gap-4 md:flex-col md:items-center md:text-center">
                  <span className="flex size-14 shrink-0 items-center justify-center rounded-2xl bg-primary-soft text-primary">
                    <Icon className="size-7" aria-hidden />
                  </span>
                  <div>
                    <h3 className="text-lg font-bold">{t(`highlights.${key}.title`)}</h3>
                    <p className="mt-1 text-muted">{t(`highlights.${key}.body`)}</p>
                  </div>
                </li>
              ))}
            </ul>
          </div>
        </section>

        {/* How it works */}
        <section aria-labelledby="how-title" className="mx-auto max-w-7xl px-4 py-12">
          <h2 id="how-title" className="text-center text-2xl font-bold md:text-3xl">
            {t("how.title")}
          </h2>
          <ol className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {STEPS.map(({ key, icon: Icon }, i) => (
              <li key={key}>
                <Card className="h-full p-5">
                  <div className="flex items-center gap-3">
                    <span className="tabular flex size-10 items-center justify-center rounded-full bg-primary text-lg font-extrabold text-white" aria-hidden>
                      {i + 1}
                    </span>
                    <Icon className="size-6 text-primary" aria-hidden />
                  </div>
                  <h3 className="mt-4 text-lg font-bold">{t(`how.${key}.title`)}</h3>
                  <p className="mt-1 text-sm text-muted">{t(`how.${key}.body`)}</p>
                </Card>
              </li>
            ))}
          </ol>
        </section>

        {/* Comparison cards: computed from a real plan */}
        {sample && (
          <section aria-labelledby="cmp-title" className="bg-card">
            <div className="mx-auto max-w-7xl px-4 py-12">
              <div className="text-center">
                <Badge tone="good">{t("compare.sample")}</Badge>
                <h2 id="cmp-title" className="mt-3 text-2xl font-bold md:text-3xl">
                  {t("compare.title")}
                </h2>
                <p className="mt-1 text-muted">
                  {t("compare.subtitle", { date: dayLabel(bkkTime(sample.date, "12:00"), locale, { weekday: "long", day: "numeric", month: "long" }) })}
                </p>
              </div>
              <div className="mt-8 grid gap-4 md:grid-cols-3 md:items-stretch">
                {sample.cards.map(({ kind, trip }) => {
                  const cheapest = sample.cards.find((c) => c.kind === "cheapest")!.trip;
                  const fastest = sample.cards.find((c) => c.kind === "fastest")!.trip;
                  const featured = kind === "value";
                  const edge =
                    kind === "cheapest"
                      ? t("compare.edge.cheapest", { amount: money(Math.max(0, fastest.cost.amount - trip.cost.amount), locale) })
                      : kind === "fastest"
                        ? t("compare.edge.fastest", { duration: duration(Math.max(0, cheapest.minutes - trip.minutes)) })
                        : t("compare.edge.value", { rate: money(DEFAULT_TIME_VALUE, locale) });
                  const refund =
                    trip.refund.kind === "full"
                      ? t("compare.refundFull")
                      : trip.refund.kind === "partial"
                        ? t("compare.refundPartial", { hours: trip.refund.deadlineHours ?? 0, pct: 100 - Math.round((trip.refund.feeBps ?? 0) / 100) })
                        : t("compare.refundNone");
                  const checks: { text: string; ok: boolean }[] = [
                    { text: edge, ok: true },
                    { text: t("compare.transfers", { n: trip.transfers }), ok: true },
                    { text: t("compare.walk", { min: Math.round(trip.walkMin) }), ok: true },
                    trip.weatherRisk < 0.3 ? { text: t("compare.weatherOk"), ok: true } : { text: t("compare.weatherRisk"), ok: false },
                    ...(trip.cost.onChain > 0 ? [{ text: t("compare.bookOnChain", { amount: money(trip.cost.onChain, locale) }), ok: true }] : []),
                    { text: refund, ok: true },
                  ];
                  return (
                    <Card key={kind} className={cn("relative flex flex-col p-6", featured && "border-2 border-primary md:-my-2 md:py-8")}>
                      {featured && (
                        <Badge tone="primary" className="absolute -top-3 left-1/2 -translate-x-1/2 bg-[#1463FF] px-3 py-1 text-white">
                          {t("compare.recommended")}
                        </Badge>
                      )}
                      <p className="text-sm font-bold uppercase tracking-wide text-primary">{t(`compare.label.${kind}`)}</p>
                      <div className="mt-3 flex items-center gap-1.5" aria-label={modeStrip(trip).map((m) => tm(m)).join(" → ")} role="img">
                        {modeStrip(trip).map((m, i) => (
                          <span key={`${m}-${i}`} className="flex items-center gap-1.5">
                            {i > 0 && <ArrowRight className="size-3.5 text-muted" aria-hidden />}
                            <ModeIcon mode={m} className="size-9" />
                          </span>
                        ))}
                      </div>
                      <p className="mt-4">
                        <span className="tabular text-4xl font-extrabold text-fg">{money(trip.cost.amount, locale)}</span>
                        <span className="ml-1 text-sm text-muted">{t("compare.perPerson")}</span>
                      </p>
                      <p className="mt-1 font-semibold text-fg">{t("compare.doorToDoor", { duration: duration(trip.minutes) })}</p>
                      <p className="text-sm text-muted">{t("compare.mainMode", { mode: tm(trip.mainMode) })}</p>
                      <ul className="mt-5 flex-1 space-y-2 border-t border-border pt-5 text-sm">
                        {checks.map((c) => (
                          <li key={c.text} className="flex gap-2">
                            {c.ok ? (
                              <Check className="mt-0.5 size-4 shrink-0 text-good" aria-hidden />
                            ) : (
                              <TriangleAlert className="mt-0.5 size-4 shrink-0 text-warn" aria-hidden />
                            )}
                            <span>{c.text}</span>
                          </li>
                        ))}
                      </ul>
                      <Link
                        href={`/plan?from=${encodeURIComponent(SAMPLE.from)}&to=${encodeURIComponent(SAMPLE.to)}&date=${sample.date}&time=${SAMPLE.time}&mode=depart&pax=1&priority=${kind}`}
                        className={cn(buttonVariants({ variant: featured ? "primary" : "outline" }), "mt-6 w-full")}
                      >
                        {t("compare.cta")}
                      </Link>
                    </Card>
                  );
                })}
              </div>
            </div>
          </section>
        )}

        {/* Operator banner */}
        <section aria-labelledby="op-title" className="mx-auto max-w-7xl px-4 py-12">
          <div
            className="relative overflow-hidden rounded-2xl p-8 text-white shadow-soft md:p-12"
            style={{ background: "linear-gradient(120deg, #1463FF 0%, #0B4FD6 100%)" }}
          >
            <ScanLine aria-hidden className="absolute -right-6 -top-6 size-48 text-white opacity-10" />
            <div className="relative flex flex-col gap-6 md:flex-row md:items-center md:justify-between">
              <div className="max-w-2xl">
                <p className="text-sm font-semibold uppercase tracking-wide text-white/90">{t("operator.eyebrow")}</p>
                <h2 id="op-title" className="mt-2 text-2xl font-extrabold md:text-4xl">
                  {t("operator.title")}
                </h2>
                <p className="mt-3 text-white/95">{t("operator.body")}</p>
              </div>
              <Link
                href="/operator"
                className="inline-flex h-14 shrink-0 items-center justify-center gap-2 rounded-xl bg-white px-6 text-lg font-semibold text-[#0B4FD6] hover:bg-white/90"
              >
                <QrCode className="size-5" aria-hidden />
                {t("operator.cta")}
              </Link>
            </div>
          </div>
        </section>

        {/* Live stats from chain */}
        <LandingStats
          labels={{ title: t("stats.title"), trips: t("stats.trips"), tickets: t("stats.tickets"), refunds: t("stats.refunds"), note: t("stats.note") }}
        />

        {/* Data sources as text */}
        <section aria-labelledby="data-title" className="border-t border-border bg-card">
          <div className="mx-auto flex max-w-7xl flex-col gap-4 px-4 py-8 md:flex-row md:items-center">
            <h2 id="data-title" className="shrink-0 text-sm font-bold uppercase tracking-wide text-muted">
              {t("dataFrom.title")}
            </h2>
            <ul className="flex flex-wrap gap-x-6 gap-y-2 text-sm font-semibold text-fg">
              {(["gtfs", "openMeteo", "osm", "duffel"] as const).map((k) => (
                <li key={k}>{t(`dataFrom.${k}`)}</li>
              ))}
            </ul>
            <Link href="/about-data" className="inline-flex min-h-12 items-center gap-1 text-sm font-semibold text-primary hover:underline md:ml-auto">
              {t("dataFrom.more")}
              <ArrowRight className="size-4" aria-hidden />
            </Link>
          </div>
        </section>
      </main>
      <Footer />
    </>
  );
}
