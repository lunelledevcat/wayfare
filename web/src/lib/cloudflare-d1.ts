import "server-only";

/**
 * Cloudflare D1 over the REST API. The app runs on Vercel (not Workers), so the database
 * cannot be bound directly; every query is an HTTPS call authenticated with an API token.
 * https://developers.cloudflare.com/api/resources/d1/subresources/database/methods/query/
 */
export type D1Param = string | number | boolean | null;

interface D1Response<T> {
  success: boolean;
  errors: { code: number; message: string }[];
  result: { success: boolean; results: T[]; meta: { changes?: number; last_row_id?: number; duration?: number } }[];
}

export class D1Error extends Error {
  constructor(
    message: string,
    public status?: number,
  ) {
    super(message);
    this.name = "D1Error";
  }
}

export function d1Configured(): boolean {
  return !!(process.env.CLOUDFLARE_ACCOUNT_ID && process.env.CLOUDFLARE_D1_DATABASE_ID && process.env.CLOUDFLARE_API_TOKEN);
}

/** Run one SQL statement with `?` placeholders; returns the result rows. */
export async function queryD1<T = Record<string, unknown>>(sql: string, params: D1Param[] = []): Promise<T[]> {
  const account = process.env.CLOUDFLARE_ACCOUNT_ID;
  const database = process.env.CLOUDFLARE_D1_DATABASE_ID;
  const token = process.env.CLOUDFLARE_API_TOKEN;
  if (!account || !database || !token) throw new D1Error("Cloudflare D1 is not configured (CLOUDFLARE_ACCOUNT_ID / CLOUDFLARE_D1_DATABASE_ID / CLOUDFLARE_API_TOKEN)");

  const res = await fetch(`https://api.cloudflare.com/client/v4/accounts/${account}/d1/database/${database}/query`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({ sql, params }),
    signal: AbortSignal.timeout(8000),
    cache: "no-store",
  });
  let body: D1Response<T> | null = null;
  try {
    body = (await res.json()) as D1Response<T>;
  } catch {
    /* non-JSON error page */
  }
  if (!res.ok || !body?.success) {
    const msg = body?.errors?.map((e) => e.message).join("; ") || `HTTP ${res.status}`;
    throw new D1Error(`D1 query failed: ${msg}`, res.status);
  }
  const first = body.result[0];
  if (first && !first.success) throw new D1Error("D1 statement failed");
  return first?.results ?? [];
}
