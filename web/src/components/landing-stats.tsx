"use client";

import { useLocale } from "next-intl";
import { useEffect, useState } from "react";
import { THB_PER_USDC } from "@/lib/config";
import { money, toIntl } from "@/lib/format";
import { Skeleton } from "./ui/primitives";

interface Stats {
  available: boolean;
  trips?: number;
  tickets?: number;
  refundedUsdc?: number;
}

export interface LandingStatsLabels {
  title: string;
  trips: string;
  tickets: string;
  refunds: string;
  note: string;
}

/** Live counters read from the booking contract via /api/stats. Hidden when the chain is unavailable. */
export function LandingStats({ labels }: { labels: LandingStatsLabels }) {
  const locale = useLocale();
  const [stats, setStats] = useState<Stats | null>(null);

  useEffect(() => {
    let alive = true;
    fetch("/api/stats")
      .then((r) => (r.ok ? r.json() : { available: false }))
      .then((d: Stats) => alive && setStats(d))
      .catch(() => alive && setStats({ available: false }));
    return () => {
      alive = false;
    };
  }, []);

  if (stats && !stats.available) return null;

  const num = (n: number | undefined) => new Intl.NumberFormat(toIntl(locale)).format(n ?? 0);
  const refunded = stats?.refundedUsdc ?? 0;
  const items = [
    { label: labels.trips, value: num(stats?.trips) },
    { label: labels.tickets, value: num(stats?.tickets) },
    {
      label: labels.refunds,
      value: money(refunded * THB_PER_USDC, locale),
      sub: `${refunded.toLocaleString(toIntl(locale), { maximumFractionDigits: 2 })} USDC`,
    },
  ];

  return (
    <section aria-labelledby="stats-title" className="mx-auto max-w-7xl px-4 py-12">
      <h2 id="stats-title" className="text-center text-2xl font-bold md:text-3xl">
        {labels.title}
      </h2>
      <dl className="mt-8 grid gap-4 sm:grid-cols-3" aria-busy={!stats}>
        {items.map((it) => (
          <div key={it.label} className="rounded-2xl border border-border bg-card p-6 text-center shadow-soft">
            <dt className="text-sm font-medium text-muted">{it.label}</dt>
            <dd className="mt-2">
              {stats ? (
                <>
                  <span className="tabular block text-4xl font-extrabold text-primary">{it.value}</span>
                  {it.sub && <span className="tabular mt-1 block text-xs text-muted">{it.sub}</span>}
                </>
              ) : (
                <Skeleton className="mx-auto h-10 w-28" />
              )}
            </dd>
          </div>
        ))}
      </dl>
      <p className="mt-4 text-center text-xs text-muted">{labels.note}</p>
    </section>
  );
}
