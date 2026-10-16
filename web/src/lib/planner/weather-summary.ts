import { weatherAt } from "../providers/weather";
import { HOUR } from "../time";
import type { HourlyWeather, WeatherAt } from "./types";

export interface WeatherStats {
  /** average rain probability, % */
  rain: number;
  tempMin: number;
  tempMax: number;
  /** the worst hour of the window, for choosing an icon */
  worst: Pick<WeatherAt, "code" | "precipProb" | "precipMm">;
  /** number of hourly values behind the numbers */
  hours: number;
}

export interface WeatherOverview {
  /** travel window shown to the user (epoch ms) */
  from: number;
  to: number;
  all: WeatherStats;
  origin: WeatherStats;
  destination: WeatherStats;
  /** at least one value is a seasonal average, not a forecast */
  seasonal: boolean;
}

const severity = (w: WeatherAt) => (w.code >= 95 ? 1000 : 0) + w.precipMm * 20 + w.precipProb;

/** Hours that overlap [from, to]; if none (e.g. a very short trip), the single nearest hour. */
function hoursIn(w: HourlyWeather, from: number, to: number): WeatherAt[] {
  const inside = w.hours.filter((h) => h.time + HOUR > from && h.time <= to);
  if (inside.length) return inside;
  const near = weatherAt(w, from);
  return near ? [near] : [];
}

function stats(hours: WeatherAt[]): WeatherStats {
  if (hours.length === 0) return { rain: 0, tempMin: 0, tempMax: 0, worst: { code: 0, precipProb: 0, precipMm: 0 }, hours: 0 };
  const worst = hours.reduce((a, b) => (severity(b) > severity(a) ? b : a));
  return {
    rain: Math.round(hours.reduce((s, h) => s + h.precipProb, 0) / hours.length),
    tempMin: Math.round(Math.min(...hours.map((h) => h.tempC))),
    tempMax: Math.round(Math.max(...hours.map((h) => h.tempC))),
    worst: { code: worst.code, precipProb: worst.precipProb, precipMm: worst.precipMm },
    hours: hours.length,
  };
}

/**
 * One-card summary of the weather over the actual travel window [depart, arrive].
 * Origin hours come from the first `edgeHours` of the trip and destination hours from the last
 * `edgeHours`, so a 10-hour coach ride is not averaged over the whole night in between.
 */
export function summarizeWeather(origin: HourlyWeather, destination: HourlyWeather, depart: number, arrive: number, edgeHours = 4): WeatherOverview {
  const edge = edgeHours * HOUR;
  const o = hoursIn(origin, depart, Math.min(arrive, depart + edge));
  const d = hoursIn(destination, Math.max(depart, arrive - edge), arrive);
  return {
    from: depart,
    to: arrive,
    all: stats([...o, ...d]),
    origin: stats(o),
    destination: stats(d),
    seasonal: !origin.forecastAvailable || !destination.forecastAvailable,
  };
}
