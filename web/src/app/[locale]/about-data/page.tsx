import { ExternalLink } from "lucide-react";
import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";
import type { ReactNode } from "react";
import { Footer } from "@/components/footer";
import { Header } from "@/components/header";
import { ModeIcon } from "@/components/mode-icon";
import { Badge, Card } from "@/components/ui/primitives";
import { CAR_DEFAULTS, TOLL_MIN_KM, TOLL_PER_100KM } from "@/lib/car";
import { cities } from "@/lib/places-data";
import { buffers, co2PerKm, DEFAULT_TIME_VALUE, OPERATOR_BY_MODE, refundPolicy, THB_PER_USDC, weatherRules as R } from "@/lib/config";
import { pick, toIntl } from "@/lib/format";
import type { Mode } from "@/lib/planner/types";
import fallbackFares from "../../../../data/fares/fallback.json";
import flights from "../../../../data/flights.json";
import gtfsMeta from "../../../../data/gtfs/meta.json";
import holidays from "../../../../data/holidays-th-2026.json";
import bus from "../../../../data/intercity-bus.json";
import rail from "../../../../data/intercity-rail.json";
import carRental from "../../../../data/car-rental.json";
import roadFares from "../../../../data/road-fares.json";
import climate from "../../../../data/weather-climate.json";

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "about" });
  return { title: t("meta.title"), description: t("meta.description") };
}

/** Weights used by the "value" score in planner/scoring.ts (kept in sync by hand). */
const VALUE_WEATHER_WEIGHT = 250;
const VALUE_TRANSFER_WEIGHT = 15;

type Status = "live" | "estimate" | "fallback" | "liveOrFallback";
const STATUS_TONE = { live: "good", estimate: "warn", fallback: "neutral", liveOrFallback: "primary" } as const;

const SECTIONS = ["sources", "gtfs", "flights", "road", "rental", "weather", "pricing", "scoring", "planner", "chain"] as const;
const DAYS = ["mon", "tue", "wed", "thu", "fri", "sat", "sun", "holiday"] as const;

function Section({ id, title, children }: { id: string; title: string; children: ReactNode }) {
  return (
    <section id={id} aria-labelledby={`${id}-title`} className="scroll-mt-24">
      <Card className="p-5 md:p-8">
        <h2 id={`${id}-title`} className="text-xl font-bold md:text-2xl">
          {title}
        </h2>
        <div className="mt-4 space-y-4 text-fg">{children}</div>
      </Card>
    </section>
  );
}

function Table({ head, rows }: { head: ReactNode[]; rows: ReactNode[][] }) {
  return (
    <div className="overflow-x-auto rounded-xl border border-border">
      <table className="w-full min-w-[32rem] text-left text-sm">
        <thead className="bg-bg text-xs uppercase tracking-wide text-muted">
          <tr>
            {head.map((h, i) => (
              <th key={i} scope="col" className="px-3 py-2 font-semibold">
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={i} className="border-t border-border align-top">
              {r.map((c, j) => (
                <td key={j} className="px-3 py-2">
                  {c}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

const ExtLink = ({ href, children }: { href: string; children: ReactNode }) => (
  <a href={href} target="_blank" rel="noopener noreferrer" className="inline-flex min-h-6 items-center gap-1 font-medium text-primary hover:underline">
    {children}
    <ExternalLink className="size-3.5" aria-hidden />
  </a>
);

export default async function AboutDataPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  setRequestLocale(locale);
  const [t, tm] = await Promise.all([getTranslations("about"), getTranslations("mode")]);
  const intl = toIntl(locale);

  const date = (iso: string) => new Intl.DateTimeFormat(intl, { dateStyle: "medium", timeZone: "Asia/Bangkok" }).format(new Date(iso));
  const ymd = (s: string) => date(`${s.slice(0, 4)}-${s.slice(4, 6)}-${s.slice(6, 8)}T12:00:00+07:00`);
  const num = (n: number) => new Intl.NumberFormat(intl).format(n);
  const baht = (n: number) => new Intl.NumberFormat(intl, { style: "currency", currency: "THB", minimumFractionDigits: 0, maximumFractionDigits: 2 }).format(n);
  const pct = (n: number) => Math.round(n * 100);

  const status = (s: Status) => <Badge tone={STATUS_TONE[s]}>{t(`status.${s}`)}</Badge>;
  const onRequest = t("table.onRequest");

  const sourceRows: { id: string; url: string; status: Status; updated: string }[] = [
    { id: "gtfs", url: gtfsMeta.sourceUrl, status: "live", updated: t("table.atBuild", { date: date(gtfsMeta.importedAt) }) },
    { id: "fares", url: fallbackFares.modes.bts.sourceUrl, status: "estimate", updated: date(fallbackFares.checkedAt) },
    { id: "duffel", url: "https://duffel.com/docs", status: "liveOrFallback", updated: onRequest },
    { id: "flights", url: "https://duffel.com/docs", status: "estimate", updated: date(flights.checkedAt) },
    { id: "rail", url: rail.sourceUrl, status: "estimate", updated: date(rail.checkedAt) },
    { id: "bus", url: bus.sourceUrl, status: "estimate", updated: date(bus.checkedAt) },
    { id: "osrm", url: "https://project-osrm.org/", status: "liveOrFallback", updated: onRequest },
    { id: "roadFares", url: roadFares.taxi.sourceUrl, status: "estimate", updated: date(roadFares.checkedAt) },
    { id: "rental", url: "#rental", status: "estimate", updated: date(carRental.checkedAt) },
    { id: "meteo", url: "https://open-meteo.com/en/docs", status: "liveOrFallback", updated: onRequest },
    { id: "aq", url: "https://open-meteo.com/en/docs/air-quality-api", status: "live", updated: onRequest },
    { id: "climate", url: climate.sourceUrl, status: "fallback", updated: "1991–2020" },
    { id: "nominatim", url: "https://nominatim.openstreetmap.org/", status: "live", updated: onRequest },
    { id: "places", url: "https://www.openstreetmap.org/", status: "live", updated: "—" },
    { id: "holidays", url: holidays.sourceUrl, status: "live", updated: date(holidays.checkedAt) },
  ];

  const airportName = (code: string) => {
    const a = (flights.airports as Record<string, { name: { th: string; en: string; zh?: string; ja?: string } }>)[code];
    return a ? pick(a.name, locale) : code;
  };

  let tierFrom = roadFares.taxi.flagFallKm;
  const taxiTiers = roadFares.taxi.tiers.map((tier, i, all) => {
    const label = i === all.length - 1 ? t("pricing.tierLast", { from: tierFrom }) : t("pricing.tier", { from: tierFrom, to: tier.upToKm });
    tierFrom = tier.upToKm;
    return [label, baht(tier.perKm)];
  });

  const holidayName = (h: { th: string; en: string } & Record<string, string>) => h[locale] ?? h.en;

  return (
    <>
      <Header />
      <main id="main" className="mx-auto max-w-7xl px-4 py-10">
        <h1 className="text-3xl font-extrabold tracking-tight md:text-4xl">{t("title")}</h1>
        <p className="mt-3 max-w-3xl text-muted md:text-lg">{t("intro")}</p>

        <div className="mt-8 grid grid-cols-1 gap-8 lg:grid-cols-[14rem_1fr]">
          <nav aria-label={t("toc")} className="lg:sticky lg:top-24 lg:self-start">
            <p className="mb-2 text-xs font-bold uppercase tracking-wide text-muted">{t("toc")}</p>
            <ul className="flex flex-wrap gap-2 lg:flex-col lg:gap-0">
              {SECTIONS.map((s) => (
                <li key={s}>
                  <a href={`#${s}`} className="flex min-h-12 items-center rounded-xl border border-border bg-card px-3 text-sm font-medium hover:text-primary lg:min-h-10 lg:border-0 lg:bg-transparent">
                    {t(`nav.${s}`)}
                  </a>
                </li>
              ))}
            </ul>
          </nav>

          <div className="min-w-0 space-y-6">
            {/* All sources */}
            <Section id="sources" title={t("nav.sources")}>
              <Table
                head={[t("table.source"), t("table.use"), t("table.status"), t("table.updated"), t("table.link")]}
                rows={sourceRows.map((r) => [
                  <span key="n" className="font-semibold">
                    {t(`sources.${r.id}.name`)}
                  </span>,
                  t(`sources.${r.id}.use`),
                  status(r.status),
                  <span key="u" className="tabular whitespace-nowrap">
                    {r.updated}
                  </span>,
                  <ExtLink key="l" href={r.url}>
                    {t("table.open")}
                  </ExtLink>,
                ])}
              />
            </Section>

            {/* GTFS */}
            <Section id="gtfs" title={t("gtfs.title")}>
              <p>{t("gtfs.body")}</p>
              <dl className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                {(
                  [
                    ["agencies", gtfsMeta.counts.agencies],
                    ["routes", gtfsMeta.counts.routes],
                    ["trips", gtfsMeta.counts.trips],
                    ["stops", gtfsMeta.counts.stops],
                  ] as const
                ).map(([k, v]) => (
                  <div key={k} className="rounded-xl bg-bg p-3">
                    <dt className="text-xs text-muted">{t(`gtfs.${k}`)}</dt>
                    <dd className="tabular text-2xl font-extrabold text-primary">{num(v)}</dd>
                  </div>
                ))}
              </dl>
              <ul className="space-y-1 text-sm">
                <li>
                  <span className="text-muted">{t("gtfs.feedVersion")}:</span> <span className="tabular font-medium">{gtfsMeta.feedVersion}</span>
                </li>
                <li>
                  <span className="text-muted">{t("gtfs.validity")}:</span>{" "}
                  <span className="tabular font-medium">
                    {ymd(gtfsMeta.feedStart)} – {ymd(gtfsMeta.feedEnd)}
                  </span>
                </li>
                <li>
                  <span className="text-muted">{t("gtfs.imported")}:</span> <span className="tabular font-medium">{date(gtfsMeta.importedAt)}</span> ·{" "}
                  <ExtLink href={gtfsMeta.sourceUrl}>{gtfsMeta.publisher}</ExtLink>
                </li>
              </ul>
              <h3 className="pt-2 text-lg font-bold">{t("gtfs.faresTitle")}</h3>
              <p className="text-sm text-muted">{t("gtfs.faresBody", { date: date(fallbackFares.checkedAt) })}</p>
              <Table
                head={[t("gtfs.mode"), t("gtfs.base"), t("gtfs.perStop"), t("gtfs.max"), t("table.link")]}
                rows={Object.entries(fallbackFares.modes).map(([mode, f]) => [
                  <span key="m" className="flex items-center gap-2">
                    <ModeIcon mode={mode as Mode} className="size-6" />
                    {tm(mode)}
                  </span>,
                  <span key="b" className="tabular">{baht(f.base)}</span>,
                  <span key="p" className="tabular">{baht(f.perStop)}</span>,
                  <span key="x" className="tabular">{baht(f.max)}</span>,
                  <ExtLink key="l" href={f.sourceUrl}>
                    {t("table.open")}
                  </ExtLink>,
                ])}
              />
            </Section>

            {/* Intercity */}
            <Section id="flights" title={t("flights.title")}>
              <p>{t("flights.body")}</p>
              <p className="rounded-xl bg-primary-soft p-4 font-semibold text-primary">{t("flights.formula")}</p>
              <p className="text-sm text-muted">{t("flights.band", { low: pct(flights.fareBand.lowPct), high: pct(flights.fareBand.highPct) })}</p>
              <div className="grid grid-cols-1 gap-4 md:grid-cols-3 [&>*]:min-w-0">
                <div>
                  <h3 className="mb-2 font-bold">{t("flights.dayFactor")}</h3>
                  <Table
                    head={["", t("flights.factor")]}
                    rows={DAYS.map((d) => [t(`flights.day.${d}`), <span key="f" className="tabular">× {flights.dayFactor[d]}</span>])}
                  />
                </div>
                <div>
                  <h3 className="mb-2 font-bold">{t("flights.advanceFactor")}</h3>
                  <Table
                    head={["", t("flights.factor")]}
                    rows={flights.advanceFactor.map((a) => [t("flights.advance", { days: a.minDays }), <span key="f" className="tabular">× {a.factor}</span>])}
                  />
                </div>
                <div>
                  <h3 className="mb-2 font-bold">{t("flights.timeFactor")}</h3>
                  <Table
                    head={["", t("flights.factor")]}
                    rows={flights.timeFactor.map((f) => [
                      <span key="r" className="tabular whitespace-nowrap">
                        {f.from}–{f.to}
                      </span>,
                      <span key="f" className="tabular">× {f.factor}</span>,
                    ])}
                  />
                </div>
              </div>
              <h3 className="pt-2 text-lg font-bold">{t("flights.routesTitle")}</h3>
              <Table
                head={[t("flights.route"), t("flights.blockTime"), t("flights.baseFare"), t("flights.departures")]}
                rows={flights.routes.map((r) => [
                  `${airportName(r.from)} → ${airportName(r.to)}`,
                  <span key="m" className="tabular">{t("planner.minutes", { min: r.minutes })}</span>,
                  <span key="b" className="tabular">{baht(r.base)}</span>,
                  <span key="d" className="tabular">{r.departures.length}</span>,
                ])}
              />
              <h3 className="pt-2 text-lg font-bold">{t("flights.otherTitle")}</h3>
              <ul className="list-inside list-disc space-y-1 text-sm">
                <li>
                  {t("flights.trains", { n: rail.trains.length, date: date(rail.checkedAt) })} · <ExtLink href={rail.sourceUrl}>{t("table.open")}</ExtLink>
                </li>
                <li>
                  {t("flights.buses", { n: bus.services.length, date: date(bus.checkedAt) })} · <ExtLink href={bus.sourceUrl}>{t("table.open")}</ExtLink>
                </li>
              </ul>
            </Section>

            {/* Road */}
            <Section id="road" title={t("road.title")}>
              <p>{t("road.body", { detour: roadFares.detourFactor })}</p>
              <ul className="list-inside list-disc space-y-1">
                {roadFares.rushHours.map((r) => (
                  <li key={r.from}>{t("road.rush", { from: r.from, to: r.to, factor: r.factor })}</li>
                ))}
              </ul>
              <h3 className="pt-2 font-bold">{t("road.speeds")}</h3>
              <ul className="flex flex-wrap gap-2">
                {Object.entries(roadFares.speedsKmh).map(([k, kmh]) => (
                  <li key={k} className="rounded-full bg-bg px-3 py-1 text-sm">
                    {t("road.speed", { mode: k === "highway" ? t("road.highway") : tm(k), kmh })}
                  </li>
                ))}
              </ul>
            </Section>

            {/* Rental cars */}
            <Section id="rental" title={t("rental.title")}>
              <p>{t("rental.body", { minutes: carRental.pickupMinutes })}</p>
              <p className="rounded-xl bg-warn-soft p-3 text-sm font-semibold text-warn">{t("rental.disclaimer")}</p>
              <Table
                head={[t("rental.city"), t("rental.daily"), t("rental.range"), t("rental.deposit")]}
                rows={cities.map((c) => {
                  const rate = (carRental.cities as Record<string, { daily: number; low: number; high: number; deposit: number }>)[c.id] ?? carRental.default;
                  return [
                    <span key="c" className="font-semibold">
                      {pick(c.name, locale)}
                    </span>,
                    <span key="d" className="tabular">
                      {baht(rate.daily)}
                    </span>,
                    <span key="r" className="tabular">
                      {baht(rate.low)}–{baht(rate.high)}
                    </span>,
                    <span key="p" className="tabular">
                      {baht(rate.deposit)}
                    </span>,
                  ];
                })}
              />
              <p className="text-sm text-muted">{t("rental.formula")}</p>
            </Section>

            {/* Weather */}
            <Section id="weather" title={t("weather.title")}>
              <p>{t("weather.body")}</p>
              <Table
                head={[t("weather.condition"), t("weather.effect")]}
                rows={[
                  [
                    t("weather.rules.rain.when", { prob: R.rainProb, mm: R.rainMm }),
                    t("weather.rules.rain.then", { walk: R.umbrellaWalkMin, pct: pct(R.rainRoadSlowdown - 1) }),
                  ],
                  [
                    t("weather.rules.heavy.when", { mm: R.heavyRainMm, codes: R.thunderCodes.join(", ") }),
                    t("weather.rules.heavy.then", { walk: R.longWalkMin, pct: pct(R.heavyRainRoadSlowdown - 1), extra: R.heavyRainFlightBufferMin }),
                  ],
                  [t("weather.rules.wind.when", { gust: R.gustBoatKmh }), t("weather.rules.wind.then")],
                  [t("weather.rules.heat.when", { feels: R.hotFeelsC }), t("weather.rules.heat.then", { walk: R.hotWalkMin })],
                  [t("weather.rules.pm.when", { pm: R.pm25 }), t("weather.rules.pm.then", { walk: R.longWalkMin })],
                ]}
              />
            </Section>

            {/* Pricing */}
            <Section id="pricing" title={t("pricing.title")}>
              <p>{t("pricing.body")}</p>
              <div className="grid grid-cols-1 gap-6 md:grid-cols-2 [&>*]:min-w-0">
                <div className="space-y-2">
                  <h3 className="font-bold">{t("pricing.taxiTitle")}</h3>
                  <p className="text-sm">{t("pricing.taxiFlag", { fare: baht(roadFares.taxi.flagFall), km: roadFares.taxi.flagFallKm })}</p>
                  <Table head={["", t("pricing.perKm")]} rows={taxiTiers} />
                  <p className="text-sm text-muted">
                    {t("pricing.taxiExtra", {
                      wait: baht(roadFares.taxi.waitPerMin),
                      airport: baht(roadFares.taxi.airportPickupSurcharge),
                      km: roadFares.taxi.expresswayTollOverKm,
                      toll: baht(roadFares.taxi.expresswayToll),
                    })}
                  </p>
                  <ExtLink href={roadFares.taxi.sourceUrl}>{t("table.open")}</ExtLink>
                </div>
                <div className="space-y-4">
                  <div>
                    <h3 className="font-bold">{t("pricing.winTitle")}</h3>
                    <p className="text-sm">
                      {t("pricing.win", {
                        km: roadFares.win.firstKm,
                        fare: baht(roadFares.win.firstFare),
                        to5: baht(roadFares.win.perKmTo5),
                        over5: baht(roadFares.win.perKmOver5),
                        max: roadFares.win.maxKm,
                      })}
                    </p>
                  </div>
                  <div>
                    <h3 className="font-bold">{t("pricing.grabTitle")}</h3>
                    <p className="text-sm">
                      {t("pricing.grab", {
                        base: baht(roadFares.grab.base),
                        perKm: baht(roadFares.grab.perKm),
                        perMin: baht(roadFares.grab.perMin),
                        fee: baht(roadFares.grab.bookingFee),
                        peak: roadFares.grab.peakMultiplier,
                      })}
                    </p>
                  </div>
                  <div>
                    <h3 className="font-bold">{t("pricing.carTitle")}</h3>
                    <p className="text-sm">
                      {t("pricing.car", { kmPerL: CAR_DEFAULTS.kmPerL, fuel: baht(CAR_DEFAULTS.fuelPrice), toll: baht(TOLL_PER_100KM), tollKm: TOLL_MIN_KM, parking: baht(CAR_DEFAULTS.parking) })}
                    </p>
                  </div>
                  <p className="text-sm text-muted">{t("pricing.checked", { date: date(roadFares.checkedAt) })}</p>
                </div>
              </div>
              <h3 className="pt-2 font-bold">{t("pricing.holidaysTitle")}</h3>
              <ul className="grid grid-cols-1 gap-1 text-sm sm:grid-cols-2">
                {holidays.holidays.map((h) => (
                  <li key={h.date} className="flex gap-3">
                    <span className="tabular w-28 shrink-0 text-muted">{date(`${h.date}T12:00:00+07:00`)}</span>
                    <span>{holidayName(h as { th: string; en: string } & Record<string, string>)}</span>
                  </li>
                ))}
              </ul>
            </Section>

            {/* Scoring */}
            <Section id="scoring" title={t("scoring.title")}>
              <p>{t("scoring.body")}</p>
              <ul className="grid grid-cols-1 gap-3 md:grid-cols-2">
                {(["fastest", "cheapest", "value", "comfort"] as const).map((k) => (
                  <li key={k} className="rounded-xl border border-border p-4">
                    <h3 className="font-bold text-primary">{t(`scoring.${k}.title`)}</h3>
                    <p className="mt-1 text-sm">
                      {k === "value"
                        ? t("scoring.value.body", { rate: baht(DEFAULT_TIME_VALUE), risk: baht(VALUE_WEATHER_WEIGHT), transfer: baht(VALUE_TRANSFER_WEIGHT) })
                        : t(`scoring.${k}.body`)}
                    </p>
                  </li>
                ))}
              </ul>
              <p className="text-sm text-muted">{t("scoring.filters")}</p>
            </Section>

            {/* Planner: buffers, reliability, CO2 */}
            <Section id="planner" title={t("planner.title")}>
              <p>{t("planner.body")}</p>
              <div className="grid grid-cols-1 gap-6 md:grid-cols-2 [&>*]:min-w-0">
                <div>
                  <h3 className="mb-2 font-bold">{t("planner.buffersTitle")}</h3>
                  <Table
                    head={["", ""]}
                    rows={Object.entries(buffers).map(([k, v]) => [t(`planner.buffer.${k}`), <span key="v" className="tabular">{t("planner.minutes", { min: v })}</span>])}
                  />
                </div>
                <div>
                  <h3 className="mb-2 font-bold">{t("planner.co2Title")}</h3>
                  <ul className="grid grid-cols-2 gap-2 text-sm">
                    {Object.entries(co2PerKm).map(([m, kg]) => (
                      <li key={m} className="flex items-center gap-2">
                        <ModeIcon mode={m as Mode} className="size-6" />
                        <span className="flex-1">{tm(m)}</span>
                        <span className="tabular text-muted">{t("planner.co2", { kg })}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              </div>
              <p className="text-sm text-muted">{t("planner.reliability")}</p>
            </Section>

            {/* Chain */}
            <Section id="chain" title={t("chain.title")}>
              <p>{t("chain.body")}</p>
              <p className="rounded-xl bg-warn-soft p-4 text-sm font-medium text-fg">{t("chain.demo", { rate: baht(THB_PER_USDC) })}</p>
              <h3 className="pt-2 font-bold">{t("chain.refundTitle")}</h3>
              <Table
                head={[t("gtfs.mode"), t("chain.operator"), t("chain.fee"), t("chain.deadline")]}
                rows={Object.entries(refundPolicy).map(([mode, p]) => [
                  <span key="m" className="flex items-center gap-2">
                    <ModeIcon mode={mode as Mode} className="size-6" />
                    {tm(mode)}
                  </span>,
                  OPERATOR_BY_MODE[mode as keyof typeof OPERATOR_BY_MODE],
                  <span key="f" className="tabular">{p.feeBps / 100}%</span>,
                  <span key="d" className="tabular">{t("chain.hours", { h: p.deadlineHours })}</span>,
                ])}
              />
              <ul className="list-inside list-disc space-y-1 text-sm">
                <li>{t("chain.operatorCancel")}</li>
                <li>{t("chain.noShow")}</li>
              </ul>
            </Section>
          </div>
        </div>
      </main>
      <Footer />
    </>
  );
}
