import { describe, expect, it } from "vitest";
import { summarizeWeather } from "../planner/weather-summary";
import type { HourlyWeather, WeatherAt } from "../planner/types";
import { bkkTime, HOUR } from "../time";

const hour = (hhmm: string, over: Partial<WeatherAt>): WeatherAt => ({
  time: bkkTime("2026-10-16", hhmm),
  precipProb: 0,
  precipMm: 0,
  tempC: 30,
  feelsC: 33,
  code: 1,
  windKmh: 5,
  gustKmh: 10,
  ...over,
});
const place = (name: string, hours: WeatherAt[], forecastAvailable = true): HourlyWeather => ({
  place: { id: name, name: { th: name, en: name }, lat: 13.7, lon: 100.5 },
  hours,
  forecastAvailable,
  source: { id: "t", name: "t", url: "", updatedAt: "" },
});

describe("summarizeWeather", () => {
  const origin = place("o", [hour("16:00", { precipProb: 20, tempC: 33 }), hour("17:00", { precipProb: 80, tempC: 28, code: 63, precipMm: 2 }), hour("18:00", { precipProb: 90, tempC: 27, code: 63, precipMm: 3 }), hour("19:00", { precipProb: 100, tempC: 26 })]);
  const dest = place("d", [hour("17:00", { precipProb: 70, tempC: 29 }), hour("18:00", { precipProb: 80, tempC: 27 }), hour("19:00", { precipProb: 90, tempC: 25, code: 95 })]);

  it("averages rain over the hours of the real travel window and gives the temperature range", () => {
    // 17:00–19:30 trip: origin hours 17,18,19 (all within the first 4 h) and destination hours 17,18,19
    const s = summarizeWeather(origin, dest, bkkTime("2026-10-16", "17:00"), bkkTime("2026-10-16", "19:30"));
    expect(s.origin.rain).toBe(Math.round((80 + 90 + 100) / 3));
    expect(s.destination.rain).toBe(Math.round((70 + 80 + 90) / 3));
    expect(s.all.rain).toBe(Math.round((80 + 90 + 100 + 70 + 80 + 90) / 6));
    expect(s.all.tempMin).toBe(25);
    expect(s.all.tempMax).toBe(29);
    expect(s.all.hours).toBe(6);
  });

  it("ignores hours outside the window", () => {
    const s = summarizeWeather(origin, dest, bkkTime("2026-10-16", "18:00"), bkkTime("2026-10-16", "18:30"));
    expect(s.origin.rain).toBe(90); // only the 18:00 hour overlaps
    expect(s.origin.tempMax).toBe(27);
  });

  it("takes the worst hour for the icon (thunderstorm beats plain rain)", () => {
    const s = summarizeWeather(origin, dest, bkkTime("2026-10-16", "17:00"), bkkTime("2026-10-16", "19:30"));
    expect(s.all.worst.code).toBe(95);
    expect(s.origin.worst.code).toBe(63);
  });

  it("uses origin hours near the start and destination hours near the end of a long trip", () => {
    const longO = place("o", [hour("08:00", { precipProb: 10 }), hour("09:00", { precipProb: 10 }), hour("14:00", { precipProb: 100 })]);
    const longD = place("d", [hour("08:00", { precipProb: 100 }), hour("17:00", { precipProb: 30 }), hour("18:00", { precipProb: 30 })]);
    const s = summarizeWeather(longO, longD, bkkTime("2026-10-16", "08:00"), bkkTime("2026-10-16", "18:30"));
    expect(s.origin.rain).toBe(10);
    expect(s.destination.rain).toBe(30);
    expect(s.to - s.from).toBe(10.5 * HOUR);
  });

  it("falls back to the nearest hour when no hour overlaps and flags seasonal averages", () => {
    const sparse = place("o", [hour("16:00", { precipProb: 55 })], false);
    const s = summarizeWeather(sparse, dest, bkkTime("2026-10-16", "16:20"), bkkTime("2026-10-16", "16:40"));
    expect(s.origin.rain).toBe(55);
    expect(s.seasonal).toBe(true);
  });

  it("returns zeros without crashing when there is no weather data", () => {
    const s = summarizeWeather(place("o", []), place("d", []), bkkTime("2026-10-16", "10:00"), bkkTime("2026-10-16", "11:00"));
    expect(s.all.hours).toBe(0);
    expect(s.all.rain).toBe(0);
  });
});
