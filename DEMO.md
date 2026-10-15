# Wayfare — 3-minute demo script

Setup before the demo: Hardhat node + `deploy:local` (or Fuji), dev/prod server running, browser wallet with the passenger account, a phone (or second window) with the operator account on `/th/operator`. Pick a travel date with forecast rain in the evening (check `/th/plan?from=p:asok&to=p:siam&...&time=17:00`).

## 1. Problem (20 s)
“To plan Asok → Chiang Mai today you open six sites: BTS fares, SRT timetable, a coach company, two airlines, a taxi app and a weather app — then add it all up yourself. Nobody tells you which is best *today*.”

## 2. One search, priorities, price graph (50 s)
1. Landing → chip **กรุงเทพ → เชียงใหม่** (or type อโศก → เชียงใหม่, tomorrow 08:00, 2 passengers).
2. Point at the **best-for-you box** with its reason (“เร็วกว่ารถทัวร์ … แพงกว่า ฿…, ฝนไม่มีผล”) and the weather cards for both ends.
3. Tap **⚡ เร็วสุด** → flight jumps to the top; tap **💰 ถูกสุด** → rapid train / coach on top. No reload.
4. Price chart: “**ไปวันพฤหัสถูกกว่า ฿…**” — tap the bar to re-search that day.

## 3. Weather (30 s)
1. Search **อโศก → สยาม**, the rainy hour (e.g. 17:00).
2. The motorbike-taxi option shows **“ไม่แนะนำ”**: “วินถูกที่สุด (฿…) แต่ช่วง 17:00–17:12 มีโอกาสฝน 80% — แนะนำ Grab แทน (+฿…, ไม่เปียก)” → **ดูทางเลือก** jumps to it. Point at “ถ้าออก 15:30 จะเลี่ยงฝนได้”.
3. Switch the search to **ต้องถึงก่อน** → open a trip: **“ควรออกจากบ้าน 13:20”**, time breakdown bar (เดิน/รอ/นั่ง/ต่อ/เผื่อ) and the step-by-step timeline with weather per step.

## 4. Book the whole trip in one payment (40 s)
1. Back to Bangkok → Chiang Mai, open the coach/flight trip → sticky box shows *book online* vs *pay on site* and the total × passengers.
2. **จองทั้งทริป · ฿…** → (if needed **รับเงินทดลองฟรี**) → confirm payment → confirm booking → “กำลังยืนยันบนบล็อกเชน…” → success, confetti, **ดูบน Snowtrace**.
3. **ดูตั๋วของฉัน** → NFT tickets with the on-chain SVG, **แสดง QR**.

## 5. Operator (40 s)
1. Operator phone `/th/operator` → **สแกน QR** the passenger's ticket → “ลายเซ็นถูกต้อง” → **เช็คอินและรับเงิน** → “เงินเข้าแล้ว ฿…” (Snowtrace link).
2. Another service → **ยกเลิกเที่ยวนี้** → confirm → every passenger refunded automatically; passenger app shows “ผู้ให้บริการยกเลิก · คืนเงินแล้ว”. Landing stats (trips, tickets, refunds) update live from the chain.

Close: “Real GTFS from สนข., real weather from Open-Meteo, one transaction on Avalanche.”
