// Verify every locale has the same message keys as English (th is the reference for completeness too).
// Usage: npm run check:i18n
import fs from "node:fs";
import path from "node:path";

const dir = path.resolve(import.meta.dirname, "..", "messages");
const locales = ["th", "en", "zh", "ja"];
const flatten = (obj, prefix = "") =>
  Object.entries(obj).flatMap(([k, v]) => (v && typeof v === "object" ? flatten(v, `${prefix}${k}.`) : [`${prefix}${k}`]));

const namespaces = fs.readdirSync(path.join(dir, "en")).filter((f) => f.endsWith(".json"));
let problems = 0;
for (const ns of namespaces) {
  const ref = new Set(flatten(JSON.parse(fs.readFileSync(path.join(dir, "en", ns), "utf8"))));
  for (const loc of locales) {
    const file = path.join(dir, loc, ns);
    if (!fs.existsSync(file)) {
      console.error(`missing file ${loc}/${ns}`);
      problems++;
      continue;
    }
    const keys = new Set(flatten(JSON.parse(fs.readFileSync(file, "utf8"))));
    for (const k of ref) if (!keys.has(k)) (console.error(`${loc}/${ns}: missing ${k}`), problems++);
    for (const k of keys) if (!ref.has(k)) (console.error(`${loc}/${ns}: extra ${k}`), problems++);
  }
}
if (problems) {
  console.error(`${problems} problem(s)`);
  process.exit(1);
}
console.log(`messages OK: ${namespaces.length} namespaces × ${locales.length} locales`);
