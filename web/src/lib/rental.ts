import data from "../../data/car-rental.json";
import type { Price, Source } from "./planner/types";

export const RENTAL_PICKUP_MIN = data.pickupMinutes;
export const RENTAL_LABEL = data.label;

type Rate = { daily: number; low: number; high: number; deposit: number };

/** Estimated daily rate for a city id (falls back to a national default). */
export function rentalRate(cityId: string | undefined): Rate {
  return (cityId && (data.cities as Record<string, Rate>)[cityId]) || data.default;
}

/** Rent for `days` days as a per-vehicle price range. */
export function rentalPrice(cityId: string | undefined, days: number): Price {
  const r = rentalRate(cityId);
  return { amount: Math.round(r.daily * days), low: Math.round(r.low * days), high: Math.round(r.high * days), estimate: true };
}

export const rentalCities = data.cities as Record<string, Rate>;

export const rentalSource: Source = {
  id: "car-rental-estimate",
  name: `Estimated car-rental day rates (data/car-rental.json) — ${data.label}`,
  url: "/about-data#rental",
  updatedAt: data.checkedAt,
  estimate: true,
};
