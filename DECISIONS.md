# Decisions & data notes

Every place where Wayfare uses an estimate or a fallback instead of a live source is listed here and is labelled in the UI ("ราคาโดยประมาณ" / "ข้อมูลสำรอง" badges and the per-leg source link).

## Data

| Area | What we did | Why |
|---|---|---|
| City transit (BTS, MRT, ARL, Red Line, buses, boats) | Real OTP (สนข.) GTFS feed, Mobility Database `mdb-1831`, imported at build time by `web/scripts/import-gtfs.ts` into `web/data/gtfs/*.json` (2,066 routes, 4,644 trips, 16,862 stops, 158k stop times, feed version 20261014). | Required real source. |
| Metro / bus / boat fares | Real GTFS `fare_attributes` + `fare_rules` (zone fares). BMTA and Thai Smile Bus fare tables are huge, so they are reduced to a min–max range per route and interpolated by distance travelled. Consecutive BTS (or BEM) rides are charged once using the system's zone table. `web/data/fares/fallback.json` (station-count formula) is used only when the feed has no fare. | Keeps the JSON small (~1 MB) without losing rail fares. |
| Frequency-based GTFS trips | Most trips in the feed are `frequencies.txt` templates. The router computes the next departure inside each headway window, so waits are the scheduled headway, not live arrivals. Rail legs are marked "very punctual", buses "±N min". | That is what the feed provides. |
| Long-distance trains | The GTFS feed only contains the Bangkok segment of SRT long-distance trains (the full-route copies have placeholder 00:01 timings). We take the **Bangkok departure time from GTFS** and the journey time / class / fare from SRT's published timetable (`web/data/intercity-rail.json`, labelled as estimate). | Feed limitation. |
| Intercity coaches & vans | Real GTFS coach/van services (Transport Co., Nakhonchai Air, Sombat Tour …) with their frequencies and zone fares; `web/data/intercity-bus.json` only when GTFS has no service for a city pair. | — |
| Flights | Duffel API (test mode) when `DUFFEL_TEST_TOKEN` is set. Without it: `web/data/flights.json` — realistic domestic block times and fare bands, priced `base × dayFactor × advanceFactor × timeFactor` with Thai 2026 holidays. Badged "ราคาโดยประมาณ". | No token was available while building. |
| Road times | OSRM (`OSRM_URL`, default router.project-osrm.org), cached by 3-decimal coordinates, rush hours 07–09 and 16–19 × 1.6. **During development the public OSRM server timed out**, so the app falls back to straight-line distance × 1.35 at city speeds and marks the leg as backup data; it retries OSRM after 5 minutes. | Public demo server is rate-limited. |
| Taxi / Grab / win prices | DLT Bangkok taxi meter (2023 rates), BMA/DLT motorbike-taxi table, Grab estimated from distance and time (not an official price). `web/data/road-fares.json`. | Grab has no public fare API. |
| Weather | Open-Meteo Forecast (hourly, 16 days) + Air Quality (PM2.5, 5 days), cached 30 min. Beyond the horizon or when offline: TMD 1991–2020 monthly normals with a diurnal rain shape (`web/data/weather-climate.json`), shown as "ยังไม่มีพยากรณ์ — ค่าเฉลี่ยตามฤดูกาล". | — |
| Places | Curated places + GTFS stations locally; Nominatim only after 1 s without typing, with a Wayfare User-Agent, cached 24 h. | Nominatim usage policy. |

## Planner

- City routing is a time-dependent Dijkstra over GTFS (equivalent to single-criterion RAPTOR with a boarding penalty). Multi-criteria variety comes from running it with several mode sets and access modes (walk / win / Grab), then a Pareto filter on price, arrival, departure, transfers, walking, weather risk and comfort. This was simpler and fast enough (10–40 ms per run) compared with a full multi-criteria RAPTOR.
- Intercity search is door-to-door: access (taxi or GTFS transit) → buffer (flight 90 min, train/coach 20 min, +30 min in thunderstorms) → core service → deplane → egress. Transit access is computed per hub and half-hour slot and shifted a few minutes, which keeps an intercity search around 0.5–2.5 s cold and instant when cached.
- Priority ranking and filters run on the client from the server result, so switching ⚡/💰/⭐/🛋️ never reloads.

## Chain

- Bookable operators are fictional (SkyThai Air, NorthStar Bus, Lanna Rail Express, BlueRiver Ferry, EastCoast Van). Timetables shown for those legs come from real/public data, but the ticket is sold by the demo operator.
- Prices are converted at 1 tUSDC = ฿36 and signed server-side (EIP-712, 10-minute expiry). The client never sends prices; `/api/quote` looks the trip up (or recomputes it) on the server.
- Local development uses a Hardhat node on **port 8546** (8545 was taken by another project on the dev machine). Hardhat public test keys are used only for chain 31337.
- `@base-org/account` (lazy-loaded by wagmi's Base Account connector) is aliased to a stub because its optional `@x402/*` dependencies are not installed; Wayfare does not offer that wallet.

## Not done / cut

See the summary in README → "Status".

## UI icons & sponsors

- All UI icons are inline SVG. Wayfare's own set (`web/src/components/icons/`: 24×24, stroke 1.75, currentColor) covers transport modes, the four priorities and weather (sun, cloud, rain, heavy rain, storm, wind, heat, PM2.5); generic UI icons come from lucide-react (also SVG). No emoji in the UI. Favicon/logo are SVG; the PWA manifest also lists 192/512 PNG fallbacks.
- ElevenLabs voice: `eleven_multilingual_v2` does not list Thai, so Thai text uses `eleven_v3`; on an API error the route retries once with the other model. Audio is cached 24 h per (voice, model, locale, text); uncached requests are limited to 20 per IP per 10 minutes and 1,500 characters, because the endpoint speaks client-supplied text.
- Tokenomist and U-Bot are not used.

## Current location, own car and rental cars

- **Current location** uses `navigator.geolocation` (https or localhost only) and sets the origin to a `g:lat,lon,<label>` token; the three failure cases (not secure, permission denied, position unavailable/timeout) each get their own message. Nothing is stored or sent anywhere except in the plan URL the user already shares.
- **Own car** is shown only when "I have a car I can drive" is on. Cost = fuel (`km ÷ km/L × ฿/L`, defaults 13.5 km/L and ฿38/L) + tolls (฿60 per 100 km, only above 15 km and when expressways are enabled) + parking (default ฿60), split between passengers (one car seats 5). All values are editable, travel in the URL as short params (`car=1&kmpl&fuel&toll&park&rent`, only values that differ from the defaults) and are remembered in `localStorage`.
- **Rental cars** (`mode: "rental"`) use estimated day rates per city in `web/data/car-rental.json` (฿850–1,800/day, small saloon). They are labelled "ราคาประมาณ ไม่ใช่ใบเสนอราคา" everywhere and are not any company's price. A rental trip = a 20-minute pickup/paperwork step (counted as buffer time, carries the rent × days) + the drive (fuel + tolls + parking). Offered (1) at the destination after a flight/train/coach, (2) as the door-to-door intercity drive when there is no own car (otherwise the own car is that option), (3) inside provincial cities without a metro for trips ≥ 8 km (never in Bangkok).
- The Pareto filter always keeps the best own-car trip, the best door-to-door hire-car trip and the best destination-hire-car trip, and the 30-trip cap never removes them, because self-drive options usually lose to a taxi on price alone.
