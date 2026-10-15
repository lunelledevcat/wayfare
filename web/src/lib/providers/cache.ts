/** Small in-memory TTL cache shared by all providers (per server instance). */
export class TtlCache<V> {
  private map = new Map<string, { value: V; expires: number }>();
  constructor(
    private ttlMs: number,
    private max = 500,
  ) {}

  get(key: string): V | undefined {
    const hit = this.map.get(key);
    if (!hit) return undefined;
    if (hit.expires < Date.now()) {
      this.map.delete(key);
      return undefined;
    }
    return hit.value;
  }

  set(key: string, value: V): void {
    if (this.map.size >= this.max) {
      const first = this.map.keys().next().value;
      if (first !== undefined) this.map.delete(first);
    }
    this.map.set(key, { value, expires: Date.now() + this.ttlMs });
  }

  /** Return the cached value or compute, cache and return it. Concurrent calls share one promise. */
  async wrap(key: string, fn: () => Promise<V>): Promise<V> {
    const hit = this.get(key);
    if (hit !== undefined) return hit;
    const pending = this.pending.get(key);
    if (pending) return pending;
    const p = fn()
      .then((v) => {
        this.set(key, v);
        return v;
      })
      .finally(() => this.pending.delete(key));
    this.pending.set(key, p);
    return p;
  }
  private pending = new Map<string, Promise<V>>();
}

/** fetch() with a timeout; throws on non-2xx. */
export async function fetchJson<T>(url: string, init: RequestInit & { timeoutMs?: number } = {}): Promise<T> {
  const { timeoutMs = 4000, ...rest } = init;
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(url, { ...rest, signal: ctrl.signal });
    if (!res.ok) throw new Error(`HTTP ${res.status} for ${url}`);
    return (await res.json()) as T;
  } finally {
    clearTimeout(timer);
  }
}
