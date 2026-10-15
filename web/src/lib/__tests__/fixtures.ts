import { DuffelFlightProvider } from "../providers/flights";
import { OsrmRoadProvider } from "../providers/road";
import { GtfsTransitProvider } from "../providers/transit";
import type { WeatherProvider } from "../providers/types";
import type { PlanDeps } from "../planner/plan";
import type { HourlyWeather, PlaceRef, WeatherAt } from "../planner/types";
import { HOUR } from "../time";

/** Weather fixture: the same conditions every hour. */
export function fixedWeather(over: Partial<WeatherAt>): WeatherProvider {
  return {
    async hourly(place: PlaceRef, from: number, to: number): Promise<HourlyWeather> {
      const hours: WeatherAt[] = [];
      for (let t = Math.floor(from / HOUR) * HOUR; t <= to + HOUR; t += HOUR) {
        hours.push({ time: t, precipProb: 10, precipMm: 0, tempC: 31, feelsC: 34, code: 1, windKmh: 8, gustKmh: 15, pm25: 20, ...over });
      }
      return { place, hours, forecastAvailable: true, source: { id: "fixture", name: "fixture", url: "", updatedAt: new Date().toISOString() } };
    },
  };
}

export function testDeps(weather: WeatherProvider): PlanDeps {
  return {
    transit: new GtfsTransitProvider(),
    flights: new DuffelFlightProvider(),
    road: new OsrmRoadProvider(),
    weather,
    today: "2026-10-15",
  };
}
