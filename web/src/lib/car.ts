/** Private-car and rental-car cost options (user-editable, carried in the URL as short params). */
export interface CarOptions {
  /** the traveller has their own car and can drive it */
  own: boolean;
  /** fuel economy, km per litre */
  kmPerL: number;
  /** ฿ per litre */
  fuelPrice: number;
  /** use expressways (tolls) */
  tolls: boolean;
  /** ฿ parking at the destination */
  parking: number;
  /** days a rental car is kept */
  rentDays: number;
}

export const CAR_DEFAULTS: CarOptions = { own: false, kmPerL: 13.5, fuelPrice: 38, tolls: true, parking: 60, rentDays: 1 };

/** Tolls: ฿60 per 100 km, only on trips longer than 15 km and when expressways are enabled. */
export const TOLL_PER_100KM = 60;
export const TOLL_MIN_KM = 15;
/** One car carries 5 passengers. */
export const CAR_SEATS = 5;

const LIMITS = {
  kmPerL: [3, 40],
  fuelPrice: [10, 100],
  parking: [0, 2000],
  rentDays: [1, 30],
} as const;

const clamp = (n: unknown, [lo, hi]: readonly [number, number], fallback: number) => {
  const v = typeof n === "string" && n.trim() === "" ? NaN : Number(n);
  return Number.isFinite(v) ? Math.min(hi, Math.max(lo, v)) : fallback;
};

/** Fill in defaults and clamp every value to a sane range. */
export function normalizeCar(c?: Partial<CarOptions> | null): CarOptions {
  return {
    own: c?.own === true,
    kmPerL: Math.round(clamp(c?.kmPerL, LIMITS.kmPerL, CAR_DEFAULTS.kmPerL) * 10) / 10,
    fuelPrice: Math.round(clamp(c?.fuelPrice, LIMITS.fuelPrice, CAR_DEFAULTS.fuelPrice) * 100) / 100,
    tolls: c?.tolls === undefined ? CAR_DEFAULTS.tolls : c.tolls === true,
    parking: Math.round(clamp(c?.parking, LIMITS.parking, CAR_DEFAULTS.parking)),
    rentDays: Math.round(clamp(c?.rentDays, LIMITS.rentDays, CAR_DEFAULTS.rentDays)),
  };
}

type ParamSource = URLSearchParams | Record<string, string | string[] | undefined>;
const read = (src: ParamSource, k: string): string | undefined => {
  const v = src instanceof URLSearchParams ? (src.get(k) ?? undefined) : src[k];
  return Array.isArray(v) ? v[0] : v;
};

/** car=1, kmpl, fuel, toll=0|1, park, rent → CarOptions (missing params keep their defaults). */
export function carFromParams(src: ParamSource): CarOptions {
  const toll = read(src, "toll");
  return normalizeCar({
    own: read(src, "car") === "1",
    kmPerL: read(src, "kmpl") as unknown as number,
    fuelPrice: read(src, "fuel") as unknown as number,
    tolls: toll === undefined ? undefined : toll !== "0",
    parking: read(src, "park") as unknown as number,
    rentDays: read(src, "rent") as unknown as number,
  });
}

/** Only values that differ from the defaults go into the URL. */
export function carToParams(car: CarOptions): Record<string, string> {
  const c = normalizeCar(car);
  const out: Record<string, string> = {};
  if (c.own) out.car = "1";
  if (c.kmPerL !== CAR_DEFAULTS.kmPerL) out.kmpl = String(c.kmPerL);
  if (c.fuelPrice !== CAR_DEFAULTS.fuelPrice) out.fuel = String(c.fuelPrice);
  if (c.tolls !== CAR_DEFAULTS.tolls) out.toll = c.tolls ? "1" : "0";
  if (c.parking !== CAR_DEFAULTS.parking) out.park = String(c.parking);
  if (c.rentDays !== CAR_DEFAULTS.rentDays) out.rent = String(c.rentDays);
  return out;
}

export const isDefaultCar = (c: CarOptions) => Object.keys(carToParams(c)).length === 0;

export const fuelCost = (km: number, c: CarOptions) => (km / c.kmPerL) * c.fuelPrice;
export const tollCost = (km: number, c: CarOptions) => (c.tolls && km > TOLL_MIN_KM ? (km / 100) * TOLL_PER_100KM : 0);

/** Running costs of one car over `km` (₿, whole car, not per person). */
export function carRunningCost(km: number, c: CarOptions) {
  const fuel = fuelCost(km, c);
  const toll = tollCost(km, c);
  return { fuel, toll, parking: c.parking, total: fuel + toll + c.parking };
}

/** Number of cars needed and the share of one car's cost per passenger. */
export const carsFor = (pax: number) => Math.max(1, Math.ceil(pax / CAR_SEATS));
export const perPassenger = (vehicleCost: number, pax: number) => (vehicleCost * carsFor(pax)) / Math.max(1, pax);
