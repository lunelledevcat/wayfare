/**
 * Weather-aware rules: turn the hourly forecast at each leg's place and time into
 * warnings, risk and slow-downs. Thresholds live in config.ts (weatherRules).
 */
import { weatherRules as R } from "../config";
import { bkkHHMM } from "../time";
import type { Leg, Mode, WeatherAt, Warning } from "./types";

export const isRainy = (w?: WeatherAt) => !!w && (w.precipProb >= R.rainProb || w.precipMm >= R.rainMm);
export const isHeavyRain = (w?: WeatherAt) => !!w && (w.precipMm >= R.heavyRainMm || R.thunderCodes.includes(w.code));
export const isWindy = (w?: WeatherAt) => !!w && w.gustKmh >= R.gustBoatKmh;
export const isHot = (w?: WeatherAt) => !!w && w.feelsC >= R.hotFeelsC;
export const isSmoggy = (w?: WeatherAt) => !!w && (w.pm25 ?? 0) > R.pm25;

const ROAD_MODES: Mode[] = ["taxi", "grab", "car", "rental", "win", "bus", "coach", "van"];

/** Multiplier for road travel time under this weather. */
export function roadSlowdown(mode: Mode, w?: WeatherAt): number {
  if (!ROAD_MODES.includes(mode)) return 1;
  if (isHeavyRain(w)) return R.heavyRainRoadSlowdown;
  if (isRainy(w)) return R.rainRoadSlowdown;
  return 1;
}

/** Extra minutes added to the airport buffer in heavy rain / storms. */
export function flightBufferExtra(w?: WeatherAt): number {
  return isHeavyRain(w) ? R.heavyRainFlightBufferMin : 0;
}

export interface LegAssessment {
  warnings: Warning[];
  /** 0..1 */
  risk: number;
  notRecommended: boolean;
}

const window = (leg: Leg) => `${bkkHHMM(leg.depart)}–${bkkHHMM(leg.arrive)}`;

/** Apply the rules to one leg. */
export function assessLeg(leg: Leg): LegAssessment {
  const w = leg.weather;
  const warnings: Warning[] = [];
  let risk = 0;
  let notRecommended = false;
  if (!w) return { warnings, risk, notRecommended };
  const base = { prob: w.precipProb, time: window(leg), mm: Number(w.precipMm.toFixed(1)) };

  if (leg.mode === "win") {
    if (isHeavyRain(w)) {
      warnings.push({ code: "win.heavyRain", level: "avoid", legId: leg.id, message: { key: "warn.winHeavyRain", params: { ...base, price: leg.price.amount } } });
      risk = 1;
      notRecommended = true;
    } else if (isRainy(w)) {
      warnings.push({ code: "win.rain", level: "avoid", legId: leg.id, message: { key: "warn.winRain", params: { ...base, price: leg.price.amount } } });
      risk = 0.8;
      notRecommended = true;
    }
  }

  if (leg.mode === "walk" && leg.outdoor) {
    if (isHeavyRain(w) && leg.minutes > R.longWalkMin) {
      warnings.push({ code: "walk.heavyRain", level: "avoid", legId: leg.id, message: { key: "warn.walkHeavyRain", params: { ...base, min: Math.round(leg.minutes) } } });
      risk = Math.max(risk, 0.9);
      notRecommended = true;
    } else if (isRainy(w) && leg.minutes > R.umbrellaWalkMin) {
      warnings.push({ code: "walk.umbrella", level: "caution", legId: leg.id, message: { key: "warn.walkUmbrella", params: { ...base, min: Math.round(leg.minutes) } } });
      risk = Math.max(risk, 0.35);
    }
    if (isHot(w) && leg.minutes > R.hotWalkMin) {
      warnings.push({ code: "walk.heat", level: "caution", legId: leg.id, message: { key: "warn.walkHeat", params: { feels: Math.round(w.feelsC), min: Math.round(leg.minutes) } } });
      risk = Math.max(risk, 0.3);
    }
    if (isSmoggy(w) && leg.minutes >= R.longWalkMin) {
      warnings.push({ code: "walk.pm25", level: "caution", legId: leg.id, message: { key: "warn.walkPm25", params: { pm25: w.pm25 ?? 0, min: Math.round(leg.minutes) } } });
      risk = Math.max(risk, 0.2);
    }
  }

  if (leg.mode === "boat") {
    if (isWindy(w)) {
      warnings.push({ code: "boat.wind", level: "avoid", legId: leg.id, message: { key: "warn.boatWind", params: { gust: Math.round(w.gustKmh), time: base.time } } });
      risk = Math.max(risk, 0.9);
      notRecommended = true;
    } else if (isHeavyRain(w)) {
      warnings.push({ code: "boat.rain", level: "caution", legId: leg.id, message: { key: "warn.boatRain", params: base } });
      risk = Math.max(risk, 0.5);
    }
  }

  if ((leg.weatherSlowdown ?? 1) > 1) {
    warnings.push({
      code: "road.slow",
      level: "info",
      legId: leg.id,
      message: { key: "warn.roadSlow", params: { pct: Math.round(((leg.weatherSlowdown ?? 1) - 1) * 100), time: base.time, prob: w.precipProb } },
    });
    risk = Math.max(risk, isHeavyRain(w) ? 0.4 : 0.2);
  }

  if (leg.mode === "flight" && isHeavyRain(w)) {
    warnings.push({ code: "flight.storm", level: "caution", legId: leg.id, message: { key: "warn.flightStorm", params: { extra: R.heavyRainFlightBufferMin } } });
    risk = Math.max(risk, 0.4);
  }

  return { warnings, risk, notRecommended };
}
