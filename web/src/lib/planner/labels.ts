import type { LocalizedText, Mode } from "./types";

/** Mode names used inside planner messages (UI also has these in messages/*.json). */
// zh/ja: ควรให้เจ้าของภาษาตรวจ
export const MODE_LABEL: Record<Mode, LocalizedText> = {
  walk: { th: "เดิน", en: "Walk", zh: "步行", ja: "徒歩" },
  bts: { th: "BTS", en: "BTS Skytrain", zh: "BTS轻轨", ja: "BTS" },
  mrt: { th: "MRT", en: "MRT", zh: "MRT地铁", ja: "MRT" },
  arl: { th: "แอร์พอร์ต เรล ลิงก์", en: "Airport Rail Link", zh: "机场快线", ja: "エアポート・レール・リンク" },
  red: { th: "รถไฟฟ้าสายสีแดง", en: "SRT Red Line", zh: "红线", ja: "レッドライン" },
  train: { th: "รถไฟ", en: "Train", zh: "火车", ja: "鉄道" },
  bus: { th: "รถเมล์", en: "Bus", zh: "公交", ja: "路線バス" },
  coach: { th: "รถทัวร์", en: "Coach", zh: "长途巴士", ja: "長距離バス" },
  van: { th: "รถตู้", en: "Van", zh: "面包车", ja: "ロットゥー（バン）" },
  boat: { th: "เรือ", en: "Boat", zh: "船", ja: "船" },
  flight: { th: "เครื่องบิน", en: "Flight", zh: "飞机", ja: "飛行機" },
  taxi: { th: "แท็กซี่", en: "Taxi", zh: "出租车", ja: "タクシー" },
  grab: { th: "Grab", en: "Grab", zh: "Grab", ja: "Grab" },
  win: { th: "วินมอเตอร์ไซค์", en: "Motorbike taxi", zh: "摩的", ja: "バイクタクシー" },
  car: { th: "รถส่วนตัว", en: "Private car", zh: "自驾", ja: "自家用車" },
  rental: { th: "รถเช่า", en: "Rental car", zh: "租车", ja: "レンタカー" },
};

export const RIDE_MODES: Mode[] = ["bts", "mrt", "arl", "red", "train", "bus", "coach", "van", "boat", "flight", "taxi", "grab", "win", "car", "rental"];
export const ROAD_MODES: Mode[] = ["taxi", "grab", "win", "car", "rental"];
export const BOOKABLE_MODES: Mode[] = ["flight", "train", "coach", "van"];
