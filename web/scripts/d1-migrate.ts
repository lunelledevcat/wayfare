/**
 * Create the `users` table in Cloudflare D1 (idempotent).
 *   npm run d1:migrate        (needs CLOUDFLARE_ACCOUNT_ID / _D1_DATABASE_ID / _API_TOKEN in the root .env)
 */
import { loadEnvConfig } from "@next/env";
import path from "node:path";
import { d1Configured, queryD1 } from "../src/lib/cloudflare-d1";
import { USERS_SCHEMA } from "../src/lib/users";

loadEnvConfig(path.resolve(__dirname, "..", ".."));

async function main() {
  if (!d1Configured()) throw new Error("Set CLOUDFLARE_ACCOUNT_ID, CLOUDFLARE_D1_DATABASE_ID and CLOUDFLARE_API_TOKEN first");
  await queryD1(USERS_SCHEMA);
  const cols = await queryD1<{ name: string }>("SELECT name FROM pragma_table_info('users')");
  console.log(`users table ready: ${cols.map((c) => c.name).join(", ")}`);
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
