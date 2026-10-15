export interface LatLon {
  lat: number;
  lon: number;
}

const R = 6371;

/** Great-circle distance in km. */
export function haversineKm(a: LatLon, b: LatLon): number {
  const dLat = ((b.lat - a.lat) * Math.PI) / 180;
  const dLon = ((b.lon - a.lon) * Math.PI) / 180;
  const la1 = (a.lat * Math.PI) / 180;
  const la2 = (b.lat * Math.PI) / 180;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(la1) * Math.cos(la2) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

/** Simple uniform grid index for nearest-stop lookups. */
export class GridIndex<T extends LatLon> {
  private cells = new Map<string, T[]>();
  constructor(
    items: T[],
    private cellDeg = 0.01,
  ) {
    for (const it of items) {
      const k = this.key(it.lat, it.lon);
      let list = this.cells.get(k);
      if (!list) this.cells.set(k, (list = []));
      list.push(it);
    }
  }
  private key(lat: number, lon: number) {
    return `${Math.floor(lat / this.cellDeg)}:${Math.floor(lon / this.cellDeg)}`;
  }
  /** Items within `km` of `p`, sorted by distance. */
  near(p: LatLon, km: number): { item: T; km: number }[] {
    const span = Math.ceil(km / 111 / this.cellDeg) + 1;
    const cy = Math.floor(p.lat / this.cellDeg);
    const cx = Math.floor(p.lon / this.cellDeg);
    const out: { item: T; km: number }[] = [];
    for (let y = cy - span; y <= cy + span; y++) {
      for (let x = cx - span; x <= cx + span; x++) {
        const list = this.cells.get(`${y}:${x}`);
        if (!list) continue;
        for (const item of list) {
          const d = haversineKm(p, item);
          if (d <= km) out.push({ item, km: d });
        }
      }
    }
    return out.sort((a, b) => a.km - b.km);
  }
}
