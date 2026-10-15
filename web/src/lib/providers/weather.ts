import climate from "../../../data/weather-climate.json";
import type { HourlyWeather, PlaceRef, Source, WeatherAt } from "../planner/types";
import { bkkDate, bkkTime, DAY, HOUR } from "../time";
import { fetchJson, TtlCache } from "./cache";
import type { WeatherProvider } from "./types";

const FORECAST_URL = "https://api.open-meteo.com/v1/forecast";
const AQ_URL = "https://air-quality-api.open-meteo.com/v1/air-quality";
const HORIZON_DAYS = 16;
const AQ_HORIZON_DAYS = 5;
const cache = new TtlCache<HourlyWeather>(30 * 60_000, 300);

interface OmForecast {
  hourly: {
    time: string[];
    precipitation_probability: (number | null)[];
    precipitation: (number | null)[];
    temperature_2m: (number | null)[];
    apparent_temperature: (number | null)[];
    weather_code: (number | null)[];
    wind_speed_10m: (number | null)[];
    wind_gusts_10m: (number | null)[];
  };
}
interface OmAq {
  hourly: { time: string[]; pm2_5: (number | null)[] };
}

function region(lat: number): keyof typeof climate.regions {
  if (lat >= 16.5) return "north";
  if (lat < 10.5) return "south";
  return "central";
}

/** Seasonal-average hourly weather (no forecast available). */
export function seasonalHours(place: { lat: number; lon: number }, fromEpoch: number, toEpoch: number): WeatherAt[] {
  const r = climate.regions[region(place.lat)];
  const hours: WeatherAt[] = [];
  for (let t = Math.floor(fromEpoch / HOUR) * HOUR; t <= toEpoch; t += HOUR) {
    const d = new Date(t + 7 * HOUR);
    const month = d.getUTCMonth();
    const hour = d.getUTCHours();
    const prob = Math.min(95, Math.round(r.rainShare[month] * 100 * climate.hourlyRainShape[hour]));
    const tmax = r.tmax[month];
    const temp = tmax - 8 * (0.5 + 0.5 * Math.cos(((hour - 14) / 24) * 2 * Math.PI)) + 0; // max at 14:00
    hours.push({
      time: t,
      precipProb: prob,
      precipMm: prob >= 60 ? 1.2 : prob >= 40 ? 0.4 : 0,
      tempC: Math.round(temp),
      feelsC: Math.round(temp + (r.rainShare[month] > 0.4 ? 4 : 2)),
      code: prob >= 60 ? 61 : prob >= 35 ? 3 : 1,
      windKmh: 8,
      gustKmh: 18,
      pm25: r.pm25[month],
      seasonal: true,
    });
  }
  return hours;
}

const seasonalSource = (): Source => ({
  id: "climate-normals",
  name: climate.source,
  url: climate.sourceUrl,
  updatedAt: "2020-12-31",
  fallback: true,
  estimate: true,
});

export class OpenMeteoWeatherProvider implements WeatherProvider {
  async hourly(place: PlaceRef, fromEpoch: number, toEpoch: number): Promise<HourlyWeather> {
    const start = bkkDate(fromEpoch);
    const end = bkkDate(toEpoch);
    const key = `${place.lat.toFixed(2)},${place.lon.toFixed(2)}|${start}|${end}`;
    return cache.wrap(key, () => this.load(place, start, end, fromEpoch, toEpoch));
  }

  private async load(place: PlaceRef, start: string, end: string, fromEpoch: number, toEpoch: number): Promise<HourlyWeather> {
    const horizonEnd = bkkTime(bkkDate(Date.now())) + HORIZON_DAYS * DAY;
    if (fromEpoch >= horizonEnd || process.env.WEATHER_OFFLINE === "1") {
      return { place, hours: seasonalHours(place, fromEpoch, toEpoch), source: seasonalSource(), forecastAvailable: false };
    }
    const endClamped = bkkTime(end) >= horizonEnd ? bkkDate(horizonEnd - DAY) : end;
    try {
      const params = new URLSearchParams({
        latitude: place.lat.toFixed(3),
        longitude: place.lon.toFixed(3),
        hourly:
          "precipitation_probability,precipitation,temperature_2m,apparent_temperature,weather_code,wind_speed_10m,wind_gusts_10m",
        timezone: "Asia/Bangkok",
        start_date: start,
        end_date: endClamped,
      });
      const aqEnd = bkkTime(bkkDate(Date.now())) + AQ_HORIZON_DAYS * DAY;
      const aqPromise: Promise<Map<string, number> | null> =
        fromEpoch < aqEnd
          ? fetchJson<OmAq>(
              `${AQ_URL}?${new URLSearchParams({ latitude: place.lat.toFixed(3), longitude: place.lon.toFixed(3), hourly: "pm2_5", timezone: "Asia/Bangkok", start_date: start, end_date: endClamped })}`,
              { timeoutMs: 3000 },
            )
              .then((aq) => new Map(aq.hourly.time.map((t, i) => [t, aq.hourly.pm2_5[i] ?? NaN] as [string, number])))
              .catch(() => null)
          : Promise.resolve(null);
      const [fc, pm] = await Promise.all([fetchJson<OmForecast>(`${FORECAST_URL}?${params}`, { timeoutMs: 4000 }), aqPromise]);
      const h = fc.hourly;
      const hours: WeatherAt[] = h.time.map((t, i) => ({
        time: bkkTime(t.slice(0, 10), t.slice(11, 16)),
        precipProb: h.precipitation_probability[i] ?? 0,
        precipMm: h.precipitation[i] ?? 0,
        tempC: h.temperature_2m[i] ?? 30,
        feelsC: h.apparent_temperature[i] ?? 32,
        code: h.weather_code[i] ?? 0,
        windKmh: h.wind_speed_10m[i] ?? 0,
        gustKmh: h.wind_gusts_10m[i] ?? 0,
        pm25: pm && Number.isFinite(pm.get(t)) ? Math.round(pm.get(t)!) : undefined,
      }));
      // days beyond the horizon inside the range get seasonal values
      const last = hours.at(-1)?.time ?? fromEpoch;
      if (last < toEpoch) hours.push(...seasonalHours(place, last + HOUR, toEpoch));
      return {
        place,
        hours,
        forecastAvailable: true,
        source: {
          id: "open-meteo",
          name: pm ? "Open-Meteo Forecast + Air Quality API" : "Open-Meteo Forecast API",
          url: "https://open-meteo.com/",
          updatedAt: new Date().toISOString(),
        },
      };
    } catch {
      return { place, hours: seasonalHours(place, fromEpoch, toEpoch), source: seasonalSource(), forecastAvailable: false };
    }
  }
}

/** Weather at the hour containing `epoch` (nearest hour). */
export function weatherAt(w: HourlyWeather | undefined, epoch: number): WeatherAt | undefined {
  if (!w || w.hours.length === 0) return undefined;
  let best = w.hours[0];
  for (const h of w.hours) if (Math.abs(h.time + HOUR / 2 - epoch) < Math.abs(best.time + HOUR / 2 - epoch)) best = h;
  return Math.abs(best.time - epoch) <= 2 * HOUR ? best : undefined;
}

/** Worst weather across [from, to]. */
export function worstWeather(w: HourlyWeather | undefined, from: number, to: number): WeatherAt | undefined {
  if (!w) return undefined;
  const span = w.hours.filter((h) => h.time + HOUR > from && h.time <= to);
  if (span.length === 0) return weatherAt(w, from);
  return span.reduce((a, b) => {
    const sa = a.precipProb + a.precipMm * 10 + (a.code >= 95 ? 50 : 0);
    const sb = b.precipProb + b.precipMm * 10 + (b.code >= 95 ? 50 : 0);
    return sb > sa ? { ...b, pm25: Math.max(a.pm25 ?? 0, b.pm25 ?? 0) || undefined } : { ...a, pm25: Math.max(a.pm25 ?? 0, b.pm25 ?? 0) || undefined };
  });
}
