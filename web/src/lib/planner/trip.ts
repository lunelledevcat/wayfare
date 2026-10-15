import { co2PerKm, refundPolicy } from "../config";
import { haversineKm } from "../geo";
import { MIN } from "../time";
import { RIDE_MODES } from "./labels";
import { isHot, isRainy } from "./weather-rules";
import type { Leg, Mode, TimeBreakdown, Trip } from "./types";

/** FNV-1a → base36, stable ids for legs and trips. */
export function shortHash(s: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0).toString(36);
}

export function legId(mode: string, from: { id: string }, to: { id: string }, depart: number): string {
  return shortHash(`${mode}|${from.id}|${to.id}|${Math.round(depart / MIN)}`);
}

const isRide = (l: Leg) => l.kind === "ride" && RIDE_MODES.includes(l.mode);

/** Comfort 0..100: fewer transfers, less walking, seated, AC, dry. */
export function comfortScore(legs: Leg[]): number {
  let s = 100;
  const rides = legs.filter(isRide);
  s -= Math.max(0, rides.length - 1) * 10;
  for (const l of legs) {
    if (l.mode === "walk") s -= l.minutes * 0.8;
    if (l.kind === "ride" && !l.seated) s -= l.minutes * 0.15;
    if (l.kind === "ride" && !l.aircon && l.minutes > 15) s -= isHot(l.weather) ? 14 : 6;
    if (l.mode === "win") s -= 18 + (isRainy(l.weather) ? 30 : 0);
    if (l.mode === "van") s -= 10;
    if (l.mode === "bus") s -= 6;
    if (l.outdoor && isRainy(l.weather) && l.minutes > 3) s -= 20;
    if (l.mode === "car" && l.minutes > 240) s -= 15; // long self-drive
    if (l.mode === "train" && l.line?.classLabel?.en.includes("sleeper")) s += 8;
  }
  return Math.max(0, Math.min(100, Math.round(s)));
}

/** Assemble a trip from contiguous legs. */
export function buildTrip(legs: Leg[], scope: Trip["scope"], coreKey: string): Trip {
  const breakdown: TimeBreakdown = { walk: 0, wait: 0, ride: 0, transfer: 0, buffer: 0 };
  for (const l of legs) breakdown[l.kind] += l.minutes;
  for (const k of Object.keys(breakdown) as (keyof TimeBreakdown)[]) breakdown[k] = Math.round(breakdown[k]);

  const rides = legs.filter(isRide);
  const amount = legs.reduce((a, l) => a + l.price.amount, 0);
  const low = legs.reduce((a, l) => a + l.price.low, 0);
  const high = legs.reduce((a, l) => a + l.price.high, 0);
  const onChain = legs.filter((l) => l.bookable).reduce((a, l) => a + l.price.amount, 0);
  const mainMode: Mode = rides.slice().sort((a, b) => b.minutes - a.minutes)[0]?.mode ?? "walk";
  const modes = [...new Set(rides.map((l) => l.mode))];
  const walkMin = Math.round(legs.filter((l) => l.mode === "walk" && (l.kind === "walk" || l.kind === "transfer")).reduce((a, l) => a + l.minutes, 0));
  const levels = { high: 0, medium: 1, low: 2 } as const;
  const worst = legs.reduce<"high" | "medium" | "low">((acc, l) => (levels[l.reliability.level] > levels[acc] ? l.reliability.level : acc), "high");
  const plusMinus = Math.round(Math.sqrt(legs.reduce((a, l) => a + l.reliability.plusMinusMin ** 2, 0)));
  const co2 = legs.reduce((a, l) => a + (co2PerKm[l.mode] ?? 0) * (l.distanceKm ?? haversineKm(l.from, l.to)), 0);
  const bookable = legs.filter((l) => l.bookable);
  const fee = Math.max(0, ...bookable.map((l) => l.bookable!.cancelFeeBps));
  const deadlineH = bookable.length
    ? Math.min(...bookable.map((l) => refundPolicy[l.mode as keyof typeof refundPolicy]?.deadlineHours ?? 2))
    : undefined;

  const depart = legs[0].depart;
  const arrive = legs.at(-1)!.arrive;
  const idSeed = legs.map((l) => l.id).join(".");
  return {
    id: shortHash(idSeed) + shortHash(idSeed.split("").reverse().join("")),
    scope,
    legs,
    depart,
    arrive,
    minutes: Math.round((arrive - depart) / MIN),
    breakdown,
    cost: {
      amount: Math.round(amount),
      low: Math.round(low),
      high: Math.round(high),
      onChain: Math.round(onChain),
      onSite: Math.round(amount - onChain),
      estimate: legs.some((l) => l.price.estimate),
    },
    transfers: Math.max(0, rides.length - 1),
    walkMin,
    modes,
    mainMode,
    weatherRisk: 0,
    comfort: comfortScore(legs),
    co2Kg: Math.round(co2 * 10) / 10,
    reliability: { level: worst, plusMinusMin: plusMinus },
    warnings: [],
    notRecommended: false,
    refund: bookable.length ? { kind: "partial", feeBps: fee, deadlineHours: deadlineH } : { kind: "none" },
    coreKey,
  };
}
