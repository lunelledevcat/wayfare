/** Tunable constants for the planner, pricing and display. One place to change them. */

/** Display currency rates: units of currency per 1 THB. */
export const currencyRates = {
  THB: 1,
  USD: 1 / 36,
  CNY: 1 / 5,
  JPY: 4.2,
  // used to convert Duffel test-mode prices
  GBP: 1 / 46,
  EUR: 1 / 39,
} as const;
export type DisplayCurrency = "THB" | "USD" | "CNY" | "JPY";
export const DISPLAY_CURRENCIES: DisplayCurrency[] = ["THB", "USD", "CNY", "JPY"];

/** On-chain settlement: 1 tUSDC = 36 THB. */
export const THB_PER_USDC = 36;

/** Minimum buffers before departure (minutes). */
export const buffers = {
  flightDomestic: 90,
  flightInternational: 180,
  train: 20,
  coach: 20,
  van: 20,
  boatIntercity: 20,
  metroTransfer: 5,
};

/** Weather thresholds used by weather-rules.ts. */
export const weatherRules = {
  rainProb: 60,
  rainMm: 1,
  heavyRainMm: 5,
  thunderCodes: [95, 96, 99],
  gustBoatKmh: 40,
  hotFeelsC: 40,
  pm25: 50,
  umbrellaWalkMin: 5,
  hotWalkMin: 10,
  longWalkMin: 10,
  rainRoadSlowdown: 1.25,
  heavyRainRoadSlowdown: 1.4,
  heavyRainFlightBufferMin: 30,
};

/** Default value of time for "value" scoring (฿ per hour). */
export const DEFAULT_TIME_VALUE = 150;

/** Refund policy per bookable mode: fee kept by operator on passenger cancel, and the deadline. */
export const refundPolicy = {
  flight: { feeBps: 2000, deadlineHours: 24 },
  train: { feeBps: 1000, deadlineHours: 2 },
  coach: { feeBps: 1000, deadlineHours: 2 },
  van: { feeBps: 1000, deadlineHours: 1 },
  boat: { feeBps: 500, deadlineHours: 1 },
} as const;

/** kg CO₂ per passenger-km (vehicle modes divided by typical occupancy). */
export const co2PerKm: Record<string, number> = {
  walk: 0,
  bts: 0.03,
  mrt: 0.03,
  arl: 0.03,
  red: 0.03,
  train: 0.04,
  bus: 0.05,
  coach: 0.03,
  van: 0.06,
  boat: 0.1,
  flight: 0.15,
  taxi: 0.15,
  grab: 0.15,
  win: 0.07,
  car: 0.17,
};

/** Demo operators registered on chain (fictional names). */
export const OPERATOR_BY_MODE = {
  flight: "SkyThai Air",
  coach: "NorthStar Bus",
  train: "Lanna Rail Express",
  boat: "BlueRiver Ferry",
  van: "EastCoast Van",
} as const;

export const QUOTE_TTL_SECONDS = 600;
