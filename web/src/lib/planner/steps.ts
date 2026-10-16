import { MODE_LABEL } from "./labels";
import type { Leg, Mode, MsgRef, Trip } from "./types";

/** Walks shorter than this are not worth a mention in the card. */
export const LONG_WALK_MIN = 10;

const rides = (trip: Pick<Trip, "legs">): Leg[] => trip.legs.filter((l) => l.kind === "ride");

/** Vehicles in the order they are used; the same vehicle twice in a row is shown once. */
export function routeModes(trip: Pick<Trip, "legs">): Mode[] {
  const out: Mode[] = [];
  for (const l of rides(trip)) if (out.at(-1) !== l.mode) out.push(l.mode);
  return out;
}

/**
 * Short key points of the journey as translatable parts, e.g.
 *   get off at Pattaya terminal → change to bus → finish by motorbike taxi.
 * - the main (longest) ride gets "get off at <its end>" when something follows it
 * - every later ride is "change to <mode>", the last one "finish by <mode>"
 * - walks over 10 minutes are mentioned in place
 * A trip with a single ride and only short walks has no parts.
 */
export function stepSummary(trip: Pick<Trip, "legs">): MsgRef[] {
  const all = rides(trip);
  if (all.length === 0) return [];
  const main = all.reduce((best, l, i) => (l.minutes > all[best].minutes ? i : best), 0);
  const parts: MsgRef[] = [];
  let k = -1;
  for (const leg of trip.legs) {
    if (leg.kind === "ride") {
      k++;
      if (k >= 1) parts.push({ key: k === all.length - 1 ? "route.finish" : "route.then", params: { mode: MODE_LABEL[leg.mode] } });
      if (k === main && main < all.length - 1) parts.push({ key: "route.alight", params: { place: leg.to.name } });
    } else if (leg.mode === "walk" && leg.minutes > LONG_WALK_MIN) {
      parts.push({ key: "route.walk", params: { min: Math.round(leg.minutes) } });
    }
  }
  return parts;
}
