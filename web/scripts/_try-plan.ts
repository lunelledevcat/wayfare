import { plan } from "../src/lib/planner/plan";
import { bkkHHMM } from "../src/lib/time";
async function run(from: string, to: string, date: string, time: string, mode: "depart"|"arrive" = "depart") {
  const t0 = Date.now();
  const r = await plan({ from, to, date, time, mode, pax: 1 });
  console.log(`\n== ${from} -> ${to} ${date} ${time} ${mode}: ${r.trips.length} trips, ${r.tookMs}ms (wall ${Date.now()-t0}) scope=${r.scope} wx=${r.weather.origin.source.id}`);
  for (const t of r.trips) console.log(`  ${t.mainMode.padEnd(6)} ${bkkHHMM(t.depart)}-${bkkHHMM(t.arrive)} ${String(t.minutes).padStart(4)}m ฿${String(t.cost.amount).padStart(5)} tr=${t.transfers} walk=${t.walkMin} cmf=${t.comfort} risk=${t.weatherRisk.toFixed(1)} ${t.notRecommended?'NOTREC':''} | ${t.legs.map(l=>l.kind==='ride'?l.mode:l.kind[0]).join(' ')} ${t.warnings.map(w=>w.code).join(',')}`);
  console.log("  calendar", r.priceCalendar.reference, r.priceCalendar.days.map(d=>`${d.date.slice(5)}:${d.amount}`).join(' '));
}
(async () => {
  await run("p:asok", "c:chiangmai", "2026-10-16", "08:00");
  await run("p:asok", "p:bkk", "2026-10-16", "17:00");
  await run("p:siam", "p:dmk", "2026-10-16", "17:30", "arrive");
  await run("p:asok", "p:pattaya", "2026-10-17", "09:00");
})();
