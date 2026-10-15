"use client";

import { ArrowLeft, Clock, Database } from "lucide-react";
import dynamic from "next/dynamic";
import { useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import { pick } from "@/lib/format";
import type { PlanQuery, TimeBreakdown, Trip } from "@/lib/planner/types";
import { bkkTime } from "@/lib/time";
import { cn } from "@/lib/utils";
import * as m from "motion/react-m";
import { BookingBox } from "./booking-box";
import { ModeIcon } from "./mode-icon";
import { WarningLine } from "./trip-card";
import { EASE, SPRING } from "./ui/motion";
import { Badge, Card, Skeleton } from "./ui/primitives";
import { useFmt } from "./use-fmt";
import { VoiceButton } from "./voice-button";
import { WeatherChip } from "./weather";

const RouteMap = dynamic(() => import("./route-map"), { ssr: false, loading: () => <Skeleton className="h-full min-h-72" /> });

const KIND_STYLE: Record<keyof TimeBreakdown, string> = {
  walk: "bg-[var(--wf-mode-walk)]",
  wait: "bg-warn-fill",
  ride: "bg-primary",
  transfer: "bg-[var(--wf-mode-coach)]",
  buffer: "bg-[var(--wf-mode-van)]",
};

export function TripDetail({ trip, query, backHref, fromName, toName }: { trip: Trip; query: PlanQuery; backHref: string; fromName: string; toName: string }) {
  const t = useTranslations("trip");
  const tp = useTranslations("plan");
  const tk = useTranslations("mode.kind");
  const tm = useTranslations("mode");
  const tc = useTranslations("common");
  const { price, time, dur, msg, locale } = useFmt();
  const total = Object.values(trip.breakdown).reduce((a, b) => a + b, 0) || 1;
  // spoken summary: leave time, steps, total cost, weather warnings (read in the chosen language)
  const spoken = [
    t("voice.intro", { from: fromName, to: toName }),
    t("voice.leave", { time: time(trip.depart), arrive: time(trip.arrive), dur: dur(trip.minutes) }),
    ...trip.legs.filter((l) => l.kind === "ride" || l.kind === "buffer").slice(0, 8).map((l, i) => t("voice.step", { n: i + 1, text: msg(l.instruction) })),
    t("voice.total", { price: price(trip.cost.amount * query.pax), n: query.pax }),
    ...trip.warnings.filter((w) => w.level !== "info").slice(0, 3).map((w) => [msg(w.message), w.alternative ? msg(w.alternative.message) : ""].join(" ")),
  ].join(" ");
  const fallbacks = [...new Set(trip.legs.filter((l) => l.source.fallback).map((l) => l.source.name))];
  const sources = [...new Map(trip.legs.map((l) => [l.source.id, l.source])).values()].filter((s) => s.id !== "planner");

  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_380px]">
      <div className="min-w-0 space-y-5">
        <Link href={backHref} className="inline-flex min-h-10 items-center gap-1 rounded-lg text-sm font-semibold text-primary hover:underline">
          <ArrowLeft className="size-4" aria-hidden /> {t("back")}
        </Link>

        <Card className="p-5">
          <p className="text-sm font-semibold text-muted">{query.mode === "arrive" ? t("leaveByArrive", { deadline: time(bkkTime(query.date, query.time)) }) : t("leaveByDepart")}</p>
          <p className="mt-1 text-5xl font-extrabold tracking-tight text-primary tabular md:text-6xl">{time(trip.depart)}</p>
          <p className="mt-2 text-lg font-semibold">
            {t("arriveAt", { time: time(trip.arrive) })} · {t("doorToDoor", { dur: dur(trip.minutes) })}
          </p>
          <VoiceButton text={spoken} label={t("voice.listen")} className="mt-3" />
          <p className="mt-1 text-sm text-muted">
            {tp(`reliability.${trip.reliability.level}`, { min: trip.reliability.plusMinusMin })} · {tp("transfers", { n: trip.transfers })}
          </p>

          <h2 className="mt-5 text-sm font-bold">{t("breakdown")}</h2>
          <div className="mt-2 flex h-4 overflow-hidden rounded-full bg-bg" role="img" aria-label={(Object.keys(trip.breakdown) as (keyof TimeBreakdown)[]).map((k) => `${tk(k)} ${dur(trip.breakdown[k])}`).join(", ")}>
            {(Object.keys(trip.breakdown) as (keyof TimeBreakdown)[]).map((k) =>
              trip.breakdown[k] > 0 ? <span key={k} className={KIND_STYLE[k]} style={{ width: `${(trip.breakdown[k] / total) * 100}%` }} /> : null,
            )}
          </div>
          <ul className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-sm">
            {(Object.keys(trip.breakdown) as (keyof TimeBreakdown)[]).map((k) => (
              <li key={k} className="inline-flex items-center gap-1.5">
                <span className={cn("size-3 rounded-sm", KIND_STYLE[k])} aria-hidden />
                <span className="text-muted">{tk(k)}</span>
                <span className="font-semibold tabular">{trip.breakdown[k] > 0 ? dur(trip.breakdown[k]) : "–"}</span>
              </li>
            ))}
          </ul>
        </Card>

        <section aria-labelledby="warn">
          <h2 id="warn" className="mb-2 font-bold">
            {t("warnings")}
          </h2>
          {trip.warnings.length === 0 ? (
            <p className="rounded-xl bg-good-soft px-3 py-2 text-sm font-medium text-good">{t("noWarnings")}</p>
          ) : (
            <div className="space-y-2">
              {trip.warnings.map((w, i) => (
                <WarningLine key={i} w={w} />
              ))}
            </div>
          )}
          {fallbacks.length > 0 && <p className="mt-2 text-xs text-warn">{t("fallbackNote", { names: fallbacks.join(", ") })}</p>}
        </section>

        <section aria-labelledby="tl">
          <h2 id="tl" className="mb-3 font-bold">
            {t("timeline")} <span className="font-normal text-muted">· {t("steps", { n: trip.legs.length })}</span>
          </h2>
          <ol className="relative space-y-0">
            {trip.legs.map((l, i) => (
              <m.li
                key={l.id}
                className="grid grid-cols-[64px_40px_1fr] gap-x-2"
                initial={{ opacity: 0, x: -6 }}
                whileInView={{ opacity: 1, x: 0 }}
                viewport={{ once: true, margin: "-40px" }}
                transition={{ duration: 0.3, ease: EASE, delay: Math.min(i, 8) * 0.05 }}
              >
                <div className="pt-1 text-right text-sm font-bold tabular">
                  {time(l.depart)}
                  <div className="text-xs font-normal text-muted">{time(l.arrive)}</div>
                </div>
                <div className="flex flex-col items-center">
                  <m.span
                    initial={{ scale: 0.4, opacity: 0 }}
                    whileInView={{ scale: 1, opacity: 1 }}
                    viewport={{ once: true, margin: "-40px" }}
                    transition={{ ...SPRING, delay: Math.min(i, 8) * 0.05 + 0.05 }}
                    className="relative z-10"
                  >
                    {l.kind === "ride" || l.mode === "walk" ? (
                      <ModeIcon mode={l.mode} color={l.line?.color} className="size-10" label={tm(l.mode)} />
                    ) : (
                      <span className="flex size-10 items-center justify-center rounded-xl border border-border bg-subtle text-muted">
                        <Clock className="size-5" aria-hidden />
                      </span>
                    )}
                  </m.span>
                  {i < trip.legs.length - 1 && (
                    <m.span
                      className="-my-0.5 w-0.5 flex-1 origin-top rounded-full bg-gradient-to-b from-primary/50 to-border"
                      initial={{ scaleY: 0 }}
                      whileInView={{ scaleY: 1 }}
                      viewport={{ once: true, margin: "-40px" }}
                      transition={{ duration: 0.35, ease: EASE, delay: Math.min(i, 8) * 0.05 + 0.12 }}
                      aria-hidden
                    />
                  )}
                </div>
                <div className="pb-5">
                  <div className="flex flex-wrap items-center gap-1.5">
                    <Badge tone={l.kind === "ride" ? "primary" : l.kind === "buffer" ? "neutral" : l.kind === "wait" ? "warn" : "neutral"}>{tk(l.kind)}</Badge>
                    <span className="text-xs text-muted">{dur(l.minutes)}</span>
                    {l.bookable && <Badge tone="good">{tp("onChain")}</Badge>}
                    {l.price.amount > 0 && <span className="ml-auto text-sm font-semibold tabular">{l.price.estimate ? tp("approx", { price: price(l.price.amount) }) : price(l.price.amount)}</span>}
                  </div>
                  <p className="mt-1 font-medium">{msg(l.instruction)}</p>
                  {l.line?.classLabel && <p className="text-sm text-muted">{pick(l.line.classLabel, locale)}</p>}
                  {l.bookable && (
                    <p className="text-sm text-muted">
                      {t("operator")}: {l.bookable.operator}
                    </p>
                  )}
                  <div className="mt-1.5 flex flex-wrap items-center gap-2 text-xs text-muted">
                    {l.weather && (l.kind === "ride" || l.mode === "walk") && <WeatherChip w={l.weather} />}
                    {l.kind === "ride" && <span>{tp(`reliability.${l.reliability.level}`, { min: l.reliability.plusMinusMin })}</span>}
                    {l.kind === "ride" && (
                      <a href={l.source.url} target={l.source.url.startsWith("http") ? "_blank" : undefined} rel="noreferrer" className="inline-flex items-center gap-1 underline-offset-2 hover:underline">
                        <Database className="size-3" aria-hidden /> {l.source.name}
                        {l.source.fallback ? ` (${tc("fallbackData")})` : ""}
                      </a>
                    )}
                  </div>
                </div>
              </m.li>
            ))}
          </ol>
        </section>

        <section aria-labelledby="map">
          <h2 id="map" className="mb-2 font-bold">
            {t("map")}
          </h2>
          <div className="h-80 overflow-hidden rounded-2xl border border-border">
            <RouteMap legs={trip.legs} labels={{ from: fromName, to: toName }} className="h-full" />
          </div>
        </section>

        <section className="rounded-2xl border border-border bg-card p-4">
          <h2 className="font-bold">{t("source")}</h2>
          <ul className="mt-2 space-y-1 text-sm">
            {sources.map((s) => (
              <li key={s.id}>
                <a href={s.url} className="text-primary underline-offset-2 hover:underline" target={s.url.startsWith("http") ? "_blank" : undefined} rel="noreferrer">
                  {s.name}
                </a>
              </li>
            ))}
          </ul>
        </section>
      </div>

      <BookingBox trip={trip} query={query} />
    </div>
  );
}
