"use client";

import { useTranslations } from "next-intl";
import type { TimeBreakdown, Trip } from "@/lib/planner/types";
import { ModeIcon } from "./mode-icon";
import { useFmt } from "./use-fmt";

const KINDS: (keyof TimeBreakdown)[] = ["walk", "wait", "ride", "transfer", "buffer"];

export function CompareTable({ trips, pax }: { trips: Trip[]; pax: number }) {
  const t = useTranslations("plan.compareTable");
  const tp = useTranslations("plan");
  const { price, time, dur } = useFmt();
  const risk = (r: number) => (r >= 0.6 ? "high" : r >= 0.25 ? "medium" : "low");
  const rows: { label: string; cell: (tr: Trip) => React.ReactNode }[] = [
    { label: t("depart"), cell: (tr) => time(tr.depart) },
    { label: t("arrive"), cell: (tr) => time(tr.arrive) },
    { label: t("total"), cell: (tr) => <strong>{dur(tr.minutes)}</strong> },
    ...KINDS.map((k) => ({ label: t(k), cell: (tr: Trip) => (tr.breakdown[k] > 0 ? dur(tr.breakdown[k]) : "–") })),
    { label: t("price"), cell: (tr) => <strong className="tabular">{price(tr.cost.amount * pax)}</strong> },
    { label: t("transfers"), cell: (tr) => tp("transfers", { n: tr.transfers }) },
    { label: t("weather"), cell: (tr) => t(`risk.${risk(tr.weatherRisk)}`) },
    { label: t("co2"), cell: (tr) => `${tr.co2Kg} kg` },
    {
      label: t("refund"),
      cell: (tr) => (tr.refund.kind === "none" ? t("refundNone") : t("refundPartial", { fee: (tr.refund.feeBps ?? 0) / 100, h: tr.refund.deadlineHours ?? 0 })),
    },
  ];
  return (
    <div className="mt-4 overflow-x-auto">
      <table className="w-full min-w-[520px] border-collapse text-sm">
        <thead>
          <tr>
            <th className="p-2 text-left" />
            {trips.map((tr) => (
              <th key={tr.id} scope="col" className="p-2 text-left">
                <span className="flex gap-1">
                  {tr.legs
                    .filter((l) => l.kind === "ride")
                    .map((l) => (
                      <ModeIcon key={l.id} mode={l.mode} color={l.line?.color} className="size-6 rounded-md" />
                    ))}
                </span>
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.label} className="border-t border-border">
              <th scope="row" className="p-2 text-left font-medium text-muted">
                {r.label}
              </th>
              {trips.map((tr) => (
                <td key={tr.id} className="p-2 tabular">
                  {r.cell(tr)}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
