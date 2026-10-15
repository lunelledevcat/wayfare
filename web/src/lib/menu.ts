/**
 * Travel-type menu data shared by the header mega-menu (client) and the landing
 * page (server). Kept in a plain module so server components can read the values.
 */
import type { Mode } from "./planner/types";

const today = () => new Date(Date.now() + 7 * 3600_000).toISOString().slice(0, 10);

/** Plan URL for a sample search, optionally filtered to some modes. */
export const planHref = (from: string, to: string, modes?: Mode[]) =>
  `/plan?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}&date=${today()}&time=09:00&mode=depart&pax=1${modes ? `&modes=${modes.join(",")}` : ""}`;

export const MENU: { group: "city" | "intercity"; items: { mode: Mode; key: string; from: string; to: string; modes: Mode[] }[] }[] = [
  {
    group: "city",
    items: [
      { mode: "bts", key: "metro", from: "p:asok", to: "p:siam", modes: ["bts", "mrt", "arl", "red"] },
      { mode: "bus", key: "bus", from: "p:siam", to: "p:grandpalace", modes: ["bus"] },
      { mode: "boat", key: "boat", from: "p:sathorn", to: "p:grandpalace", modes: ["boat"] },
      { mode: "taxi", key: "taxiWin", from: "p:asok", to: "p:thonglor", modes: ["taxi", "grab", "win"] },
    ],
  },
  {
    group: "intercity",
    items: [
      { mode: "flight", key: "flight", from: "p:asok", to: "c:chiangmai", modes: ["flight"] },
      { mode: "train", key: "train", from: "p:asok", to: "c:chiangmai", modes: ["train"] },
      { mode: "coach", key: "coach", from: "p:asok", to: "c:chiangmai", modes: ["coach"] },
      { mode: "van", key: "van", from: "p:asok", to: "p:pattaya", modes: ["van"] },
    ],
  },
];

export const POPULAR = [
  { key: "asokBkk", from: "p:asok", to: "p:bkk" },
  { key: "bkkCnx", from: "p:asok", to: "c:chiangmai" },
  { key: "siamDmk", from: "p:siam", to: "p:dmk" },
  { key: "bkkPattaya", from: "p:asok", to: "p:pattaya" },
] as const;
