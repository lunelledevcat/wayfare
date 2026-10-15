"use client";

import { useQuery } from "@tanstack/react-query";
import { CalendarClock, Route } from "lucide-react";
import { useTranslations } from "next-intl";
import { useEffect, useMemo, useState } from "react";
import { useAccount, usePublicClient } from "wagmi";
import { Link } from "@/i18n/navigation";
import { activeChain, deployment, TicketStatus } from "@/lib/chain";
import { dayLabel } from "@/lib/format";
import type { WeatherAt } from "@/lib/planner/types";
import { loadSnapshots, type TripSnapshot } from "@/lib/trip-store";
import { ModeIcon } from "../mode-icon";
import { Button } from "../ui/button";
import { Badge, Card } from "../ui/primitives";
import { RainIcon } from "../icons";
import { useFmt } from "../use-fmt";
import { VoiceButton } from "../voice-button";
import { loadTrips, operatorMode, statusKey, statusTone, unitsToThb, unitsToUsdc, type LegView, type TripView } from "./chain-data";
import { ConnectPrompt, EmptyState, ListSkeleton, LoadError } from "./states";

const HOUR = 3_600_000;
const FORECAST_HORIZON = 16 * 24 * HOUR;

interface WeatherAlert {
  key: string;
  tripId: string;
  prob: number;
  was: number;
  name: string;
  kind: "transfer" | "walk" | "ride";
  at: number;
  earlier: number;
}

/** Legs of one trip grouped by service (one row per leg, with the passenger count). */
function groupLegs(legs: LegView[]) {
  const map = new Map<string, { leg: LegView; tickets: LegView[] }>();
  for (const l of legs) {
    const g = map.get(l.serviceId);
    if (g) g.tickets.push(l);
    else map.set(l.serviceId, { leg: l, tickets: [l] });
  }
  return [...map.values()].sort((a, b) => a.leg.departAt - b.leg.departAt);
}

/** Re-fetch the forecast for every snapshot point of upcoming trips and report big rain increases. */
async function checkWeather(snaps: TripSnapshot[], now: number): Promise<WeatherAlert[]> {
  const jobs = new Map<string, { lat: number; lon: number; hour: number }>();
  const points: { snap: TripSnapshot; p: TripSnapshot["points"][number]; key: string }[] = [];
  for (const snap of snaps) {
    for (const p of snap.points) {
      if (p.at < now || p.at - now > FORECAST_HORIZON || p.precipProb === null) continue;
      const hour = Math.floor(p.at / HOUR) * HOUR;
      const key = `${p.lat.toFixed(2)},${p.lon.toFixed(2)},${hour}`;
      jobs.set(key, { lat: p.lat, lon: p.lon, hour });
      points.push({ snap, p, key });
    }
  }
  const results = new Map<string, number>();
  await Promise.all(
    [...jobs].map(async ([key, j]) => {
      try {
        const res = await fetch(`/api/weather?lat=${j.lat}&lng=${j.lon}&from=${j.hour}&to=${j.hour + HOUR}`);
        if (!res.ok) return;
        const data = (await res.json()) as { hours?: WeatherAt[]; forecastAvailable?: boolean };
        if (data.forecastAvailable === false || !data.hours?.length) return;
        const near = data.hours.reduce((best, h) => (Math.abs(h.time - j.hour) < Math.abs(best.time - j.hour) ? h : best));
        if (!near.seasonal) results.set(key, near.precipProb);
      } catch {
        /* offline: no alert */
      }
    }),
  );
  const alerts: WeatherAlert[] = [];
  const seen = new Set<string>();
  for (const { snap, p, key } of points) {
    const prob = results.get(key);
    if (prob === undefined || p.precipProb === null) continue;
    if (prob - p.precipProb < 20 || prob < 50) continue;
    const id = `${snap.chainTripId}:${key}`;
    if (seen.has(id)) continue;
    seen.add(id);
    const kind = p.kind === "transfer" ? "transfer" : p.mode === "walk" ? "walk" : "ride";
    alerts.push({ key: id, tripId: snap.chainTripId, prob: Math.round(prob), was: Math.round(p.precipProb), name: p.name, kind, at: p.at, earlier: p.outdoor || p.kind === "transfer" ? 20 : 10 });
  }
  return alerts.sort((a, b) => a.at - b.at);
}

export function TripsTab() {
  const t = useTranslations("app.trips");
  const ta = useTranslations("app");
  const tw = useTranslations("wallet");
  const { price, time, locale } = useFmt();
  const { address, isConnected } = useAccount();
  const client = usePublicClient({ chainId: activeChain.id });
  const [alerts, setAlerts] = useState<WeatherAlert[] | null>(null);

  const q = useQuery({
    queryKey: ["wf-trips", activeChain.id, address],
    queryFn: () => loadTrips(client!, address!),
    enabled: !!client && !!address && !!deployment,
  });

  const [now] = useState(() => Date.now());
  const upcoming = useMemo(() => (q.data ?? []).filter((tr) => tr.legs.some((l) => l.status === TicketStatus.Booked && l.departAt > now)), [q.data, now]);

  // weather-change alerts, checked once each time the tab opens with trips loaded
  useEffect(() => {
    if (!upcoming.length) return;
    const ids = new Set(upcoming.map((tr) => String(tr.id)));
    const snaps = loadSnapshots().filter((s) => s.chainId === activeChain.id && ids.has(s.chainTripId));
    if (!snaps.length) return;
    let alive = true;
    checkWeather(snaps, Date.now()).then((a) => alive && setAlerts(a));
    return () => {
      alive = false;
    };
  }, [upcoming]);

  if (!deployment) return <EmptyState icon={Route} title={ta("noDeployment")} />;
  if (!isConnected) return <ConnectPrompt text={t("connect")} />;
  if (q.isPending) return <ListSkeleton />;
  if (q.isError) return <LoadError text={ta("loadError")} onRetry={() => q.refetch()} retryLabel={tw("tryAgain")} />;
  if (!q.data.length)
    return (
      <EmptyState
        icon={Route}
        title={t("empty")}
        body={t("emptyBody")}
        action={
          <Button asChild>
            <Link href="/app?tab=plan">{t("planNow")}</Link>
          </Button>
        }
      />
    );

  const upcomingIds = new Set(upcoming.map((tr) => tr.id));
  const past = q.data.filter((tr) => !upcomingIds.has(tr.id));

  const renderTrip = (tr: TripView) => {
    const groups = groupLegs(tr.legs);
    const first = groups[0]?.leg;
    return (
      <Card key={String(tr.id)} className="p-4">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h3 className="font-bold">
            {t("tripNo", { id: String(tr.id) })}
            {first && <span className="ml-2 font-normal text-muted">{dayLabel(first.departAt, locale)}</span>}
          </h3>
          <span className="text-right">
            <span className="block text-lg font-extrabold tabular">{price(unitsToThb(tr.total))}</span>
            <span className="block text-xs text-muted tabular">{t("paid", { usdc: unitsToUsdc(tr.total), pax: tr.pax })}</span>
          </span>
        </div>
        <ul className="mt-3 space-y-2">
          {groups.map(({ leg, tickets }) => {
            const mode = operatorMode(leg.operator);
            const counts = new Map<TicketStatus, number>();
            for (const x of tickets) counts.set(x.status, (counts.get(x.status) ?? 0) + 1);
            return (
              <li key={leg.serviceId} className="flex items-start gap-3 rounded-xl bg-bg p-3">
                {mode ? <ModeIcon mode={mode} className="size-9 shrink-0 rounded-lg" /> : <CalendarClock className="size-9 shrink-0 text-muted" aria-hidden />}
                <div className="min-w-0 flex-1">
                  <p className="font-semibold">{leg.label}</p>
                  <p className="text-sm text-muted tabular">
                    {t("departs", { day: dayLabel(leg.departAt, locale), time: time(leg.departAt) })} · {t("tickets", { n: tickets.length })}
                  </p>
                  <div className="mt-1 flex flex-wrap gap-1">
                    {[...counts].map(([s, n]) => (
                      <Badge key={s} tone={statusTone(s)}>
                        {tw(`status.${statusKey(s)}`)}
                        {tickets.length > 1 ? ` ×${n}` : ""}
                      </Badge>
                    ))}
                  </div>
                </div>
              </li>
            );
          })}
        </ul>
      </Card>
    );
  };

  return (
    <div className="space-y-5">
      {alerts && alerts.length > 0 && (
        <section aria-label={t("alertsTitle")} className="space-y-2">
          {alerts.map((a) => (
            <div key={a.key} role="alert" className="flex gap-3 rounded-2xl border border-warn bg-warn-soft p-4 text-sm">
              <RainIcon className="mt-0.5 size-5 shrink-0 text-warn" />
              <div>
                <p className="font-semibold text-fg">{t("alert", { prob: a.prob, kind: a.kind, name: a.name, min: a.earlier })}</p>
                <p className="mt-0.5 text-muted tabular">{t("alertDetail", { id: a.tripId, was: a.was, time: time(a.at) })}</p>
                <VoiceButton text={t("alert", { prob: a.prob, kind: a.kind, name: a.name, min: a.earlier })} className="mt-2" />
              </div>
            </div>
          ))}
        </section>
      )}
      <section aria-labelledby="up" className="space-y-3">
        <h2 id="up" className="font-bold">
          {t("upcoming")}
        </h2>
        {upcoming.length ? upcoming.map(renderTrip) : <p className="text-sm text-muted">{t("noUpcoming")}</p>}
      </section>
      {past.length > 0 && (
        <section aria-labelledby="past" className="space-y-3">
          <h2 id="past" className="font-bold text-muted">
            {t("past")}
          </h2>
          {past.map(renderTrip)}
        </section>
      )}
    </div>
  );
}
