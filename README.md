# Wayfare

**Every way to travel, compared in one place. Weather-aware. Booked in one payment on Avalanche.**
**เทียบทุกวิธีเดินทางในที่เดียว ดูสภาพอากาศให้แล้ว จองทุกช่วงจ่ายครั้งเดียวบน Avalanche**

U-Hackathon 2026 · Web3 track

![Landing](docs/screenshots/landing.png)

---

## The problem / ปัญหา

**EN** — Planning even a simple trip in Thailand, say Asok to Chiang Mai, means juggling five or six sites: the BTS/MRT fares, the train timetable, a coach operator, airline sites, a taxi app and a weather app. Then you do the maths yourself. And still nobody tells you which option is actually best *on that day*, how long each step really takes, when to leave home, or that the cheap motorbike taxi is a bad idea because it'll be pouring at 17:00.

**TH** — แค่จะไปเชียงใหม่จากอโศก ก็ต้องเปิดเว็บ 5-6 เว็บ ทั้งค่ารถไฟฟ้า ตารางรถไฟ รถทัวร์ สายการบิน แอปเรียกรถ และพยากรณ์อากาศ แล้วนั่งคิดเลขเอง สุดท้ายก็ยังไม่รู้ว่าวันนั้นทางไหนดีที่สุด แต่ละช่วงใช้เวลาจริงเท่าไร ต้องออกจากบ้านกี่โมง หรือรู้ไม่ทันว่าวินที่ถูกที่สุดจะเปียกฝนตอนห้าโมงเย็น

## The solution / วิธีแก้

Search once and Wayfare lines up every way to get there, from your door to theirs. You pick what matters (fastest, cheapest, best value or most comfortable) and it tells you what to take, when to leave, and what the day will cost, with the weather already checked. Then you can book every bookable leg in one payment.

ค้นหาครั้งเดียว Wayfare เทียบทุกวิธีให้ตั้งแต่หน้าบ้านถึงที่หมาย คุณเลือกว่าอะไรสำคัญ (เร็ว ถูก คุ้ม หรือสบาย) แล้วเราบอกว่าควรไปทางไหน ออกกี่โมง ทั้งทริปจ่ายเท่าไร พร้อมเช็คอากาศให้แล้ว จากนั้นจองทุกช่วงที่จองได้ด้วยการจ่ายครั้งเดียว

What's in it:

- **One search, every mode** — BTS, MRT, Airport Rail Link, Red Line, buses, boats, trains, coaches, vans, domestic flights, taxi, Grab, motorbike taxi, **your own car and rental cars**, walking — door to door. Start from **your current location** with one tap.
- **Pick what matters**: ⚡ fastest · 💰 cheapest · ⭐ best value (price + your time + weather risk) · 🛋️ most comfortable. Results re-rank instantly on the client.
- **Every minute itemised**: walk · wait · ride · transfer · buffer, with start/end times, reliability (“very punctual” vs “±20 min traffic”) and **“leave home at 13:20”** for arrive-by searches.
- **That day's prices** and the **total trip cost** × passengers, plus a **7-day price chart** (“going on Thursday is ฿420 cheaper”).
- **Weather-aware**: hourly Open-Meteo forecast at each leg's place and time. Rain ≥ 60% → motorbike taxi “not recommended” with a concrete alternative (“take Grab instead, +฿45, stays dry”); storms add airport buffer; PM2.5 and heat warnings for long walks; “leave at 15:30 to avoid the rain”.
- **Book every bookable leg in one transaction** on Avalanche C-Chain: one EIP-712 signed quote, one payment, escrow per leg, an NFT ticket per leg per passenger with a QR code, instant payout to the operator at check-in, **automatic full refund** if the operator cancels.

## Architecture

```mermaid
flowchart LR
  subgraph Browser
    UI[Next.js 15 pages<br/>next-intl th/en/zh/ja] -->|rank/filter client-side| UI
    UI -->|wagmi + RainbowKit| W[(Wallet)]
  end
  subgraph Server[Next.js Route Handlers]
    P[/POST /api/plan/] --> PL[planner<br/>GTFS router + intercity<br/>weather rules + Pareto]
    Q[/POST /api/quote/] -->|EIP-712 sign| PL
    WX[/GET /api/weather/]
    PC[/GET /api/places/]
    ST[/GET /api/stats/]
  end
  PL --> G[(OTP GTFS JSON<br/>built at build time)]
  PL --> OM[Open-Meteo forecast + AQ]
  PL --> OS[OSRM roads]
  PL --> DF[Duffel test / schedule model]
  PC --> NM[Nominatim]
  W -->|approve + bookTrip| C[WayfareBooking<br/>escrow per leg]
  C --> T[WayfareTicket ERC-721<br/>on-chain SVG]
  C --> U[MockUSDC tUSDC]
  OP[Operator console<br/>scan QR] -->|checkIn / cancel| C
```

- `web/src/lib/providers/` — adapters (`TransitProvider`, `FlightProvider`, `RoadProvider`, `WeatherProvider`), each with cache + labelled fallback; every result carries `source` + `updatedAt`.
- `web/src/lib/planner/` — pure TypeScript: time-dependent GTFS router, intercity door-to-door search with buffers, arrive-by mode, weather rules (`weather-rules.ts`, thresholds in `config.ts`), Pareto filter, scoring.
- `contracts/` — `MockUSDC`, `WayfareTicket`, `WayfareBooking` (Solidity 0.8.24, OpenZeppelin v5, Hardhat 2).

## Data sources: real vs estimated / แหล่งข้อมูลจริงและส่วนที่เป็นการประมาณ

| Data | Source | Status |
|---|---|---|
| BTS, MRT, ARL, Red Line, buses, boats, coaches, vans — routes, stops, timetables/frequencies | **OTP (สนข.) national GTFS**, Mobility Database `mdb-1831`, feed 20261014 | **Real** (imported at build time) |
| Metro / bus / boat / coach fares | GTFS `fare_attributes` + `fare_rules` | **Real**; station-count formula only if a fare is missing |
| Long-distance trains | Bangkok departure from GTFS; journey time, class and fare from SRT published timetable | Departure real, rest **estimate** |
| Domestic flights | Duffel API test mode if `DUFFEL_TEST_TOKEN`; else schedule model (`data/flights.json`) with day/holiday/advance/time-of-day factors | **Estimate** without token (badged) |
| Road distance & time | OSRM; fallback straight line × 1.35 | Real when OSRM reachable, else **backup** (badged) |
| Taxi / win / Grab prices | DLT taxi meter, BMA win table, Grab distance+time estimate | Formula real, Grab **estimate** |
| Own car | Your own fuel economy, fuel price, tolls (฿60/100 km) and parking, all editable | Formula from **your settings** |
| Rental cars | Day rates per city in `web/data/car-rental.json` (฿850–1,800/day, small saloon) | **Estimate, not a quotation** from any company |
| Hourly weather, PM2.5 | **Open-Meteo** Forecast + Air Quality | **Real**; TMD seasonal normals beyond 16 days or offline |
| Places | Curated list + GTFS stations + **Nominatim/OSM** | Real |
| Thai holidays 2026 | Cabinet / BoT holiday calendar | Real |
| Bookable operators | SkyThai Air, NorthStar Bus, Lanna Rail Express, BlueRiver Ferry, EastCoast Van | **Fictional demo operators** |

Details: [`DECISIONS.md`](DECISIONS.md) and the in-app page `/th/about-data`.

## Sponsor technologies

### Avalanche (C-Chain) — the booking and ticketing core
- **What:** every bookable leg (flight, intercity train, coach, van, boat) of a trip is paid in **one transaction** to `WayfareBooking` on Avalanche C-Chain (Fuji testnet). The contract escrows money per leg, mints one ERC-721 ticket per leg per passenger (`WayfareTicket`, on-chain SVG), releases the leg's money to the operator the moment the QR is scanned at check-in, and **refunds the holder automatically** if the operator cancels. Every transaction in the UI links to Snowtrace; the landing page, booking success screen and footer carry a "Built on Avalanche C-Chain" badge.
- **Why:** multi-operator trips today mean several payments, several refund policies and paper or app-specific tickets. A shared escrow contract gives passengers one payment and guaranteed refunds, and gives small operators instant settlement without a payment processor. Avalanche C-Chain offers EVM tooling (Hardhat, viem, wagmi), sub-second finality that makes check-in feel instant at the door, and fees low enough for per-ticket actions.

## Smart contracts (Avalanche C-Chain)

| Contract | Purpose |
|---|---|
| `MockUSDC` | `tUSDC`, 6 decimals, `faucet()` 1,000 per address per hour |
| `WayfareTicket` | ERC-721, one ticket per leg per passenger, on-chain JSON + SVG `tokenURI`, transferable only before check-in |
| `WayfareBooking` | operator registry; `bookTrip(Quote, sig)` verifies EIP-712 signature / expiry / replay / operators, pulls the total **once**, escrows per leg, mints all tickets; `checkIn` pays the operator; `cancelByOperator` refunds the holder in full; `cancelByPassenger` refunds minus fee before the deadline; `claimNoShow` after departure + 2 h |

28 Hardhat tests, including the invariant *paid out + refunded = pulled per trip*.

**Fuji addresses:** not deployed yet from this machine (needs a funded key) — run the steps below; `deploy.ts` writes them to `web/src/lib/contracts.generated.ts` and `contracts/deployments/fuji.json`. Explorer: <https://testnet.snowtrace.io>.

## Run locally / วิธีรัน

Requirements: Node 20+ (tested on 24), npm 10+.

```bash
npm install
cp .env.example .env              # local defaults work as-is
npm run import:gtfs               # optional: refresh GTFS (data is committed)
npm run node                      # terminal 1: Hardhat node on :8546
npm run deploy:local              # terminal 2: deploy + seed sample trips
npm run dev                       # terminal 2: http://localhost:3000/th
```

Wallet for local testing (Hardhat public test keys — **never use on a real network**): add network *Hardhat* `http://127.0.0.1:8546`, chain id `31337`, then import

- passenger: `0x4bbbf85ce3377467afe5d46f804f221813b2bb87f24d81f60f1fcdbf7cbf4356` (account #7)
- operator SkyThai Air: `0x5de4111afa1a4b94908f83103eb1f1706367c2e68ca870fc3fb9a804cdab365a` (#2) · NorthStar Bus `0x7c852118294e51e653712a81e05800f419141751be58f605c371e15141b007a6` (#3) · Lanna Rail Express `0x47e179ec197488593b187f80a00eb0da91f1b9d0b13f8733639f19c30a34926a` (#4)

Tests: `npm test` (contracts + web), `npm run lint`, `npm run check:i18n -w web`, `npm run build`.

## Google login + Cloudflare D1

- **Login:** next-auth 4 (Auth.js, App Router) with the Google provider at `/api/auth/[...nextauth]`; `/[locale]/login` has the "Login with Google" button, the navbar shows the account menu. `middleware.ts` guards `/[locale]/app/**` (trips, tickets, profile) and sends guests to `/login?callbackUrl=…`. The guard only turns on when `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` and `NEXTAUTH_SECRET` are set, so a fresh clone still runs as a guest.
- **Users in Cloudflare D1:** on every successful login the `signIn` event upserts the user into the `users` table (`id, email, name, image, google_id, created_at, last_login_at`) through the D1 **REST API** (`web/src/lib/cloudflare-d1.ts`, because the app runs on Vercel, not Workers). A D1 outage is logged and never blocks sign-in. Create the table once with `npm run d1:migrate` (or `web/cloudflare/schema.sql`).
- **Google Cloud Console:** OAuth client (Web application) with redirect URIs `http://localhost:3000/api/auth/callback/google` and `https://<your-domain>/api/auth/callback/google`.

## Deploy to Fuji + Vercel

```bash
# .env: DEPLOYER_PRIVATE_KEY, QUOTE_SIGNER_PRIVATE_KEY, OPERATOR_MNEMONIC, NEXT_PUBLIC_CHAIN=fuji
npm run deploy:fuji -w contracts      # deploy, register operators, verify, write addresses
npm run seed:fuji -w contracts        # sample trips for live stats
git add web/src/lib/contracts.generated.ts contracts/deployments && git commit -m "chore: Fuji deployment"
# Vercel: Root Directory = web (npm workspaces install from the repo root automatically; web/vercel.json sets function timeouts)
```

Environment variables to set in Vercel → Settings → Environment Variables (Production):

| Variable | Needed for |
|---|---|
| `NEXT_PUBLIC_CHAIN` = `fuji` | chain selection (needs the committed Fuji deployment, otherwise booking is disabled) |
| `QUOTE_SIGNER_PRIVATE_KEY` | signing booking quotes (server only) |
| `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` | Google login |
| `NEXTAUTH_SECRET` | `openssl rand -base64 32` |
| `NEXTAUTH_URL` | `https://<your-domain>` |
| `CLOUDFLARE_ACCOUNT_ID`, `CLOUDFLARE_D1_DATABASE_ID`, `CLOUDFLARE_API_TOKEN` | storing users in D1 (token needs *Account → D1 → Edit*) |
| `DUFFEL_TEST_TOKEN`, `OSRM_URL`, `NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID` *(optional)* | live flights, own routing server, mobile wallets |

## Screenshots

| Results | Trip detail | Mobile |
|---|---|---|
| ![plan](docs/screenshots/plan.png) | ![trip](docs/screenshots/trip.png) | ![mobile](docs/screenshots/plan-mobile.png) |

## Cars: your own and rented

- **My location:** the target button in the "From" field uses the browser's geolocation (https or localhost only) and shows a specific message if the page is not secure, permission is denied, or the position cannot be found.
- **I have a car:** switch it on to get a drive-yourself option. Fuel (km/L, ฿/L), tolls, parking and rental days are editable in the "Car and rental costs" panel, shared in the URL (`car=1&kmpl=&fuel=&toll=&park=&rent=`, defaults omitted) and remembered in the browser. Cost is split between passengers (one car seats 5).
- **Rental cars:** offered after a flight/train/coach (collect at the destination airport or station, 20-minute pickup step), as the door-to-door drive when you have no own car, and in provincial cities without a metro for trips of 8 km or more. Prices are estimates, not quotations. Details in `DECISIONS.md` and `/about-data#rental`.

## Roadmap

Not built yet — where Wayfare goes after the hackathon:

- **Saved plans** — keep a trip plan and come back to it later.
- **Price-drop alerts** — notify you when a flight (or other ticket) gets cheaper, so you can buy during the dip.
- **Personal-assistant reminders** — heads-ups before you travel (leave-now, weather changes, documents and things to pack), like a personal secretary.
- **Partners** — sell tickets through the site with operators, discount codes and loyalty points.

## Status

What works today: all seven phases — real GTFS + Open-Meteo data layer with fallbacks, planner with 4 priorities, itemised times, leave-by time, daily prices and total cost, weather warnings with alternatives, 7-day price chart, comparison mode, map, one-transaction booking with NFT tickets + QR, passenger cancel / transfer, operator QR check-in, cancel-and-refund, no-show claim, Thai/English (Chinese/Japanese machine-assisted, need native review), PWA manifest.
Still to do: Fuji deployment (needs keys/AVAX), live Duffel offers (needs token), service worker/offline mode, Lighthouse audit numbers.

License: MIT (code). GTFS data © OTP Thailand; map data © OpenStreetMap contributors; weather by Open-Meteo (CC BY 4.0).
