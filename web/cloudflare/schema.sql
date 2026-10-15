-- Same schema as `npm run d1:migrate`; or apply by hand:
--   npx wrangler d1 execute <database-name> --remote --file web/cloudflare/schema.sql
CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  email TEXT NOT NULL,
  name TEXT,
  image TEXT,
  google_id TEXT NOT NULL UNIQUE,
  created_at TEXT NOT NULL,
  last_login_at TEXT NOT NULL
);
