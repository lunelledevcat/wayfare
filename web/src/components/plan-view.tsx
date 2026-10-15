"use client";

import { Map as MapIcon, List, SlidersHorizontal, Sparkles, X } from "lucide-react";
import dynamic from "next/dynamic";
import { useTranslations } from "next-intl";
import { useCallback, useEffect, useMemo, useState } from "react";
import { pick } from "@/lib/format";
import { MODE_LABEL } from "@/lib/planner/labels";
import { applyFilters, bestByPriority, DEFAULT_PREFS, rankTrips, reasonFor } from "@/lib/planner/scoring";
import { PRIORITIES, type Mode, type PlanResult, type Preferences, type Priority, type Trip } from "@/lib/planner/types";
import { bkkSecOfDay } from "@/lib/time";
import { cn } from "@/lib/utils";
import * as m from "motion/react-m";
import { ChoiceChip, ModeChip, SwitchRow } from "./chips";
import { CountUp } from "./count-up";
import { ModeIcon } from "./mode-icon";
import { usePrefs } from "./prefs";
import { buildPlanUrl } from "./search-box";
import { MoonIcon, PriorityIcon, SunIcon, SunriseIcon, SunsetIcon, type Icon } from "./icons";
import { TripCard } from "./trip-card";
import { Button } from "./ui/button";
import { Dialog, DialogContent, DialogTitle } from "./ui/dialog";
import { EASE, SPRING } from "./ui/motion";
import { Segmented } from "./ui/segmented";
import { Card, Skeleton } from "./ui/primitives";
import { useFmt } from "./use-fmt";
import { WeatherSummary } from "./weather";
import { CompareTable } from "./compare-table";

const PriceChart = dynamic(() => import("./price-chart"), { ssr: false, loading: () => <Skeleton className="h-56" /> });
const RouteMap = dynamic(() => import("./route-map"), { ssr: false, loading: () => <Skeleton className="h-full min-h-72" /> });

type DayWindow = "morning" | "afternoon" | "evening" | "night";
const WINDOWS: { key: DayWindow; Icon: Icon }[] = [
  { key: "morning", Icon: SunriseIcon },
  { key: "afternoon", Icon: SunIcon },
  { key: "evening", Icon: SunsetIcon },
  { key: "night", Icon: MoonIcon },
];
const inWindow = (epoch: number, w: DayWindow) => {
  const h = bkkSecOfDay(epoch) / 3600;
  if (w === "morning") return h >= 5 && h < 12;
  if (w === "afternoon") return h >= 12 && h < 17;
  if (w === "evening") return h >= 17 && h < 21;
  return h >= 21 || h < 5;
};

interface ExtraFilters {
  /** empty = any time */
  windows: DayWindow[];
  maxTransfers: number | null;
}

export function PlanView({ result, initialPriority, initialModes }: { result: PlanResult; initialPriority?: Priority; initialModes?: Mode[] }) {
  const t = useTranslations("plan");
  const tm = useTranslations("mode");
  const { prefs: userPrefs } = usePrefs();
  const { price, dur, locale } = useFmt();
  const q = result.query;
  const [prefs, setPrefs] = useState<Preferences>({ ...DEFAULT_PREFS, priority: initialPriority ?? "value", pax: q.pax, modes: initialModes ?? null });
  const [extra, setExtra] = useState<ExtraFilters>({ windows: [], maxTransfers: null });
  const [compare, setCompare] = useState<string[]>([]);
  const [compareOpen, setCompareOpen] = useState(false);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [tab, setTab] = useState<"list" | "map">("list");
  const [highlight, setHighlight] = useState<string | null>(null);
  const [compareMsg, setCompareMsg] = useState(false);

  // value-of-time and default priority from the profile
  useEffect(() => {
    setPrefs((p) => ({ ...p, timeValue: userPrefs.timeValue, priority: initialPriority ?? userPrefs.priority }));
  }, [userPrefs.timeValue, userPrefs.priority, initialPriority]);

  const setPriority = useCallback(
    (p: Priority) => {
      setPrefs((s) => ({ ...s, priority: p }));
      const url = new URL(window.location.href);
      url.searchParams.set("priority", p);
      window.history.replaceState(null, "", url);
    },
    [],
  );

  const ranked = useMemo(
    () => rankTrips(result.trips, prefs).filter((tr) => (extra.windows.length === 0 || extra.windows.some((w) => inWindow(tr.depart, w))) && (extra.maxTransfers === null || tr.transfers <= extra.maxTransfers)),
    [result.trips, prefs, extra],
  );
  const best = useMemo(() => bestByPriority(ranked, prefs), [ranked, prefs]);
  const tagsFor = (id: string) => PRIORITIES.filter((p) => best[p] === id);
  const top = ranked.find((tr) => !tr.notRecommended);
  const reason = top ? reasonFor(top, ranked, prefs) : null;
  const allModes = useMemo(() => [...new Set(result.trips.flatMap((tr) => tr.modes))].filter((m) => m !== "walk"), [result.trips]);
  const filteredCount = ranked.length;

  const tripHref = (tr: Trip) => `/trip/${tr.id}?${new URLSearchParams({ from: q.from, to: q.to, date: q.date, time: q.time, mode: q.mode, pax: String(q.pax), priority: prefs.priority })}`;
  const goAlternative = (id: string) => {
    setHighlight(id);
    setTab("list");
    setTimeout(() => document.getElementById(`trip-${id}`)?.scrollIntoView({ behavior: "smooth", block: "center" }), 50);
  };
  const toggleCompare = (id: string, on: boolean) => {
    setCompare((c) => {
      if (!on) return c.filter((x) => x !== id);
      if (c.length >= 3) {
        setCompareMsg(true);
        return c;
      }
      return [...c, id];
    });
  };
  const resetFilters = () => {
    setPrefs((p) => ({ ...p, avoidWin: false, maxWalkMin: null, bigLuggage: false, budget: null, modes: null }));
    setExtra({ windows: [], maxTransfers: null });
  };

  // derived only from the plan result (no Date.now()) so server and client render the same
  const requested = result.weather.origin.hours[0]?.time ?? 0;
  const startWindow = result.trips.length ? Math.min(...result.trips.map((tr) => tr.depart)) : requested;
  const travelFrom = startWindow;
  const travelTo = Math.max(...result.trips.map((tr) => tr.arrive), travelFrom);

  const toggleWindow = (w: DayWindow) => setExtra((x) => ({ ...x, windows: x.windows.includes(w) ? x.windows.filter((y) => y !== w) : [...x.windows, w] }));
  const filters = (
    <div className="space-y-6">
      <fieldset>
        <legend className="mb-2.5 text-sm font-bold">{t("filters.modes")}</legend>
        <div className="flex flex-wrap gap-2">
          {allModes.map((mode) => {
            const on = prefs.modes?.includes(mode) ?? false;
            return (
              <ModeChip
                key={mode}
                mode={mode}
                label={tm(mode)}
                on={on}
                onToggle={() => setPrefs((p) => ({ ...p, modes: on ? (p.modes ?? []).filter((x) => x !== mode) : [...(p.modes ?? []), mode] }))}
              />
            );
          })}
        </div>
      </fieldset>
      <fieldset>
        <legend className="mb-2.5 text-sm font-bold">{t("filters.departWindow")}</legend>
        <div className="grid grid-cols-2 gap-2">
          {WINDOWS.map(({ key, Icon }) => (
            <ChoiceChip key={key} on={extra.windows.includes(key)} onClick={() => toggleWindow(key)} icon={<Icon className="size-6 shrink-0" />} label={t(`filters.windowName.${key}`)} sub={t(`filters.windowRange.${key}`)} />
          ))}
        </div>
      </fieldset>
      <label className="block">
        <span className="mb-2.5 block text-sm font-bold">{t("filters.budget")}</span>
        <input
          type="number"
          inputMode="numeric"
          min={0}
          step={50}
          placeholder={t("filters.budgetAny")}
          value={prefs.budget ?? ""}
          onChange={(e) => setPrefs((p) => ({ ...p, budget: e.target.value ? Number(e.target.value) : null }))}
          className="h-12 w-full rounded-xl border border-border bg-card px-3 tabular hover:border-primary/40 focus:border-primary focus:outline-none focus:ring-4 focus:ring-ring"
        />
      </label>
      <div>
        <p className="mb-2.5 text-sm font-bold">{t("filters.transfers")}</p>
        <Segmented
          ariaLabel={t("filters.transfers")}
          size="sm"
          value={extra.maxTransfers === null ? "any" : String(extra.maxTransfers)}
          onChange={(v) => setExtra((x) => ({ ...x, maxTransfers: v === "any" ? null : Number(v) }))}
          options={[{ value: "any", label: t("filters.transfersAny") }, ...[0, 1, 2].map((n) => ({ value: String(n), label: t("filters.transfersShort", { n }) }))]}
        />
      </div>
      <div>
        <p className="mb-2.5 text-sm font-bold">{t("filters.maxWalk")}</p>
        <Segmented
          ariaLabel={t("filters.maxWalk")}
          size="sm"
          value={prefs.maxWalkMin === null ? "any" : String(prefs.maxWalkMin)}
          onChange={(v) => setPrefs((p) => ({ ...p, maxWalkMin: v === "any" ? null : Number(v) }))}
          options={[{ value: "any", label: t("filters.maxWalkAny") }, ...[5, 10, 15].map((n) => ({ value: String(n), label: t("filters.minShort", { n }) }))]}
        />
      </div>
      <div className="space-y-2">
        <SwitchRow on={prefs.avoidWin} onChange={(v) => setPrefs((p) => ({ ...p, avoidWin: v }))} label={t("filters.avoidWin")} />
        <SwitchRow on={prefs.bigLuggage} onChange={(v) => setPrefs((p) => ({ ...p, bigLuggage: v }))} label={t("filters.bigLuggage")} hint={t("filters.bigLuggageHint")} />
      </div>
      <Button variant="ghost" className="w-full" onClick={resetFilters}>
        {t("resetFilters")}
      </Button>
    </div>
  );

  return (
    <div className="space-y-5">
      {/* priority segmented control */}
      <section aria-labelledby="prio">
        <h2 id="prio" className="sr-only">
          {t("priorityLabel")}
        </h2>
        <Segmented
          ariaLabel={t("priorityLabel")}
          value={prefs.priority}
          onChange={setPriority}
          size="lg"
          columns="grid-cols-2 md:grid-cols-4"
          className="bg-card p-1.5 shadow-soft"
          options={PRIORITIES.map((p) => ({ value: p, label: t(`priority.${p}`), icon: <PriorityIcon priority={p} className="size-5" />, hint: t(`priorityHint.${p}`) }))}
        />
      </section>

      {/* best for you */}
      {top && (
        <Card className="border-primary/30 bg-gradient-to-br from-primary-soft to-card p-4 md:p-5">
          <p className="flex items-center gap-2 text-sm font-bold text-primary">
            <Sparkles className="size-4" aria-hidden /> {t("best")} · <PriorityIcon priority={prefs.priority} className="size-4" /> {t(`priority.${prefs.priority}`)}
          </p>
          <div className="mt-2 flex flex-wrap items-center gap-3">
            <div className="flex items-center gap-1">
              {top.legs
                .filter((l) => l.kind === "ride")
                .map((l) => (
                  <ModeIcon key={l.id} mode={l.mode} color={l.line?.color} className="size-9" />
                ))}
            </div>
            <p className="text-lg font-bold">
              {pick(MODE_LABEL[top.mainMode], locale)} · {dur(top.minutes)} · <CountUp className="tabular" value={top.cost.amount * q.pax} format={price} />
            </p>
          </div>
          {reason && (
            <p className="mt-1 text-sm text-fg">
              {reason.minutesSaved >= 0
                ? t("bestReason.faster", { h: Math.floor(Math.abs(reason.minutesSaved) / 60), m: Math.abs(reason.minutesSaved) % 60, mode: tm(reason.rivalMode) })
                : t("bestReason.slower", { h: Math.floor(Math.abs(reason.minutesSaved) / 60), m: Math.abs(reason.minutesSaved) % 60, mode: tm(reason.rivalMode) })}
              {" · "}
              {reason.priceDiff > 0 ? t("bestReason.pricier", { price: price(reason.priceDiff) }) : reason.priceDiff < 0 ? t("bestReason.cheaper", { price: price(-reason.priceDiff) }) : t("bestReason.samePrice")}
              {" · "}
              {reason.weatherOk ? t("bestReason.weatherOk") : t("bestReason.weatherRisk")}
            </p>
          )}
        </Card>
      )}

      {/* weather */}
      <section aria-labelledby="wx">
        <h2 id="wx" className="mb-2 font-bold">
          {t("weather.title")}
        </h2>
        <div className="grid gap-3 md:grid-cols-2">
          <WeatherSummary label={t("weather.origin")} w={result.weather.origin} from={startWindow} to={startWindow + 4 * 3600_000} />
          <WeatherSummary label={t("weather.destination")} w={result.weather.destination} from={Math.min(travelTo, travelFrom + 30 * 3600_000) - 2 * 3600_000} to={Math.min(travelTo, travelFrom + 30 * 3600_000) + 2 * 3600_000} />
        </div>
        {result.betterDeparture && (
          <p className="mt-2 rounded-xl bg-warn-soft px-3 py-2 text-sm font-semibold text-warn">
            {t("weather.better", { time: result.betterDeparture.time, prob: result.betterDeparture.precipProb, now: result.betterDeparture.currentProb })}
          </p>
        )}
      </section>

      {/* mobile tabs */}
      <div className="flex gap-2 lg:hidden">
        <Button variant={tab === "list" ? "primary" : "outline"} className="flex-1" onClick={() => setTab("list")} aria-pressed={tab === "list"}>
          <List aria-hidden /> {t("list")}
        </Button>
        <Button variant={tab === "map" ? "primary" : "outline"} className="flex-1" onClick={() => setTab("map")} aria-pressed={tab === "map"}>
          <MapIcon aria-hidden /> {t("map")}
        </Button>
        <Button variant="outline" onClick={() => setFiltersOpen(true)} aria-label={t("filters.open")}>
          <SlidersHorizontal aria-hidden />
        </Button>
      </div>

      <div className="grid gap-5 lg:grid-cols-[280px_1fr]">
        <aside className="hidden lg:block">
          <Card className="sticky top-20 p-4">
            <h2 className="mb-4 font-bold">{t("filters.title")}</h2>
            {filters}
          </Card>
        </aside>

        <div className="min-w-0 space-y-4">
          <div className={cn(tab === "map" ? "block" : "hidden", "lg:block")}>
            <div className="grid gap-4 xl:grid-cols-2">
              {result.scope === "intercity" && <PriceChart days={result.priceCalendar.days} selected={q.date} reference={result.priceCalendar.reference} pax={q.pax} hrefFor={(date) => buildPlanUrl({ ...q, date, priority: prefs.priority })} />}
              {top && (
                <div className={cn("h-72 overflow-hidden rounded-2xl border border-border", result.scope !== "intercity" && "xl:col-span-2")}>
                  <RouteMap legs={top.legs} labels={{ from: pick(result.from.name, locale), to: pick(result.to.name, locale) }} className="h-full" />
                </div>
              )}
            </div>
          </div>

          <div className={cn(tab === "list" ? "block" : "hidden", "space-y-3 lg:block")}>
            <div className="flex items-center justify-between">
              <p className="font-bold" aria-live="polite">
                {t("trips", { n: filteredCount })}
              </p>
              {compare.length > 0 && (
                <Button size="sm" onClick={() => setCompareOpen(true)}>
                  {t("compareSelected", { n: compare.length })}
                </Button>
              )}
            </div>
            {compareMsg && (
              <p role="status" className="flex items-center justify-between rounded-xl bg-warn-soft px-3 py-2 text-sm text-warn">
                {t("compareMax")}
                <button type="button" onClick={() => setCompareMsg(false)} aria-label={t("compareDismiss")} className="press flex size-11 items-center justify-center rounded-lg">
                  <X className="size-4" />
                </button>
              </p>
            )}
            {ranked.length === 0 && (
              <Card className="p-8 text-center">
                <p className="font-semibold">{t("noMatch")}</p>
                <Button variant="secondary" className="mt-4" onClick={resetFilters}>
                  {t("resetFilters")}
                </Button>
              </Card>
            )}
            {ranked.map((tr, i) => (
              <m.div key={tr.id} layout="position" initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.3, ease: EASE, delay: Math.min(i, 10) * 0.04, layout: SPRING }}>
              <TripCard
                trip={tr}
                tags={tagsFor(tr.id)}
                pax={q.pax}
                href={tripHref(tr)}
                compareOn={compare.includes(tr.id)}
                onCompare={(on) => toggleCompare(tr.id, on)}
                onAlternative={goAlternative}
                highlight={highlight === tr.id}
              />
              </m.div>
            ))}
          </div>
        </div>
      </div>

      <Dialog open={filtersOpen} onOpenChange={setFiltersOpen}>
        <DialogContent closeLabel={t("filters.title")}>
          <DialogTitle>{t("filters.title")}</DialogTitle>
          <div className="mt-4">{filters}</div>
          <Button className="mt-4 w-full" onClick={() => setFiltersOpen(false)}>
            {t("filters.apply", { n: applyFilters(result.trips, prefs).length })}
          </Button>
        </DialogContent>
      </Dialog>

      <Dialog open={compareOpen} onOpenChange={setCompareOpen}>
        <DialogContent closeLabel={t("compareTitle")} className="sm:w-[min(96vw,900px)]">
          <DialogTitle>{t("compareTitle")}</DialogTitle>
          <CompareTable trips={result.trips.filter((tr) => compare.includes(tr.id))} pax={q.pax} />
        </DialogContent>
      </Dialog>
    </div>
  );
}
