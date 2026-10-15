import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const ENV = { CLOUDFLARE_ACCOUNT_ID: "acc123", CLOUDFLARE_D1_DATABASE_ID: "db456", CLOUDFLARE_API_TOKEN: "tok789" };

describe("Cloudflare D1 REST helper", () => {
  beforeEach(() => Object.assign(process.env, ENV));
  afterEach(() => {
    vi.unstubAllGlobals();
    for (const k of Object.keys(ENV)) delete process.env[k];
  });

  it("posts sql + params with a bearer token to the account/database endpoint", async () => {
    const fetchMock = vi.fn(async () => ({ ok: true, status: 200, json: async () => ({ success: true, errors: [], result: [{ success: true, results: [{ n: 1 }], meta: {} }] }) }));
    vi.stubGlobal("fetch", fetchMock);
    const { queryD1 } = await import("../cloudflare-d1");
    const rows = await queryD1("SELECT ? AS n", [1]);
    expect(rows).toEqual([{ n: 1 }]);
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("https://api.cloudflare.com/client/v4/accounts/acc123/d1/database/db456/query");
    expect((init.headers as Record<string, string>).Authorization).toBe("Bearer tok789");
    expect(JSON.parse(init.body as string)).toEqual({ sql: "SELECT ? AS n", params: [1] });
  });

  it("throws a readable error when Cloudflare rejects the query", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => ({ ok: false, status: 400, json: async () => ({ success: false, errors: [{ code: 7500, message: "no such table: users" }], result: [] }) })));
    const { queryD1 } = await import("../cloudflare-d1");
    await expect(queryD1("SELECT * FROM users")).rejects.toThrow(/no such table: users/);
  });

  it("refuses to run when not configured", async () => {
    delete process.env.CLOUDFLARE_API_TOKEN;
    const { queryD1, d1Configured } = await import("../cloudflare-d1");
    expect(d1Configured()).toBe(false);
    await expect(queryD1("SELECT 1")).rejects.toThrow(/not configured/);
  });
});

describe("user upsert on login", () => {
  beforeEach(() => Object.assign(process.env, ENV));
  afterEach(() => {
    vi.unstubAllGlobals();
    for (const k of Object.keys(ENV)) delete process.env[k];
  });

  it("upserts by google_id with email, name, image and timestamps", async () => {
    const fetchMock = vi.fn(async () => ({ ok: true, status: 200, json: async () => ({ success: true, errors: [], result: [{ success: true, results: [], meta: {} }] }) }));
    vi.stubGlobal("fetch", fetchMock);
    const { recordLogin } = await import("../users");
    await recordLogin({ googleId: "g-1", email: "a@b.co", name: "Ann", image: "https://img/x.png" });
    const body = JSON.parse((fetchMock.mock.calls[0] as unknown as [string, RequestInit])[1].body as string);
    expect(body.sql).toMatch(/INSERT INTO users/);
    expect(body.sql).toMatch(/ON CONFLICT\(google_id\) DO UPDATE/);
    expect(body.sql).toMatch(/last_login_at = excluded.last_login_at/);
    const [id, email, name, image, googleId, created, last] = body.params;
    expect([email, name, image, googleId]).toEqual(["a@b.co", "Ann", "https://img/x.png", "g-1"]);
    expect(id).toMatch(/^[0-9a-f-]{36}$/);
    expect(created).toBe(last);
  });

  it("never blocks sign-in when D1 fails", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => { throw new Error("network down"); }));
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    const { recordLogin } = await import("../users");
    await expect(recordLogin({ googleId: "g-2", email: "c@d.co" })).resolves.toBeUndefined();
    expect(spy).toHaveBeenCalled();
  });
});
