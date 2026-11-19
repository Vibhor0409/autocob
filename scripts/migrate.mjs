// Applies db/schema.sql. Safe to run repeatedly: every statement is "if not exists".
// Run with: npm run migrate   (reads DATABASE_URL from the environment or .env.local)
import { neon } from "@neondatabase/serverless";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
let url = process.env.DATABASE_URL;
if (!url && existsSync(join(root, ".env.local"))) {
  const line = readFileSync(join(root, ".env.local"), "utf8")
    .split("\n")
    .find((l) => l.startsWith("DATABASE_URL="));
  if (line) url = line.slice("DATABASE_URL=".length).trim().replace(/^"|"$/g, "");
}
if (!url) {
  console.error("DATABASE_URL is not set.");
  process.exit(1);
}

const sql = neon(url);
const statements = readFileSync(join(root, "db", "schema.sql"), "utf8")
  .split("\n")
  .filter((l) => !l.trim().startsWith("--"))
  .join("\n")
  .split(";")
  .map((s) => s.trim())
  .filter(Boolean);

for (const statement of statements) await sql.query(statement);
const tables = await sql.query(
  "select table_name from information_schema.tables where table_schema = 'public' order by table_name",
);
console.log(`Applied ${statements.length} statements. Tables: ${tables.map((t) => t.table_name).join(", ")}`);
