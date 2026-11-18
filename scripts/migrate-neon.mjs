import { Client } from "pg";
import fs from "node:fs/promises";
import { createHash } from "node:crypto";
if (
  !process.env.DATABASE_URL ||
  !process.env.NEON_AUTH_BASE_URL ||
  !process.env.NEON_AUTH_COOKIE_SECRET ||
  !process.env.NAJD_OWNER_EMAIL
)
  throw Error(
    "Missing required Neon environment keys. Pull the project environment first.",
  );
const url = new URL(
  process.env.DATABASE_URL_UNPOOLED || process.env.DATABASE_URL,
);
if (url.hostname.endsWith(".neon.tech"))
  url.searchParams.set("sslmode", "verify-full");
const client = new Client({ connectionString: url.toString() });
try {
  await client.connect();
  const existing = await client.query(
    "select table_name from information_schema.tables where table_schema='public' and table_type='BASE TABLE'",
  );
  console.log(
    "Existing public tables:",
    existing.rows.map((r) => r.table_name).join(", ") || "(empty)",
  );
  await client.query("create schema if not exists najd_migrations");
  await client.query(
    "create table if not exists najd_migrations.applied(name text primary key,checksum text not null,applied_at timestamptz not null default now())",
  );
  const dir = new URL("../database/migrations/", import.meta.url);
  const files = (await fs.readdir(dir))
    .filter((f) => f.endsWith(".sql"))
    .sort();
  for (const file of files) {
    const source = await fs.readFile(new URL(file, dir), "utf8");
    const checksum = createHash("sha256").update(source).digest("hex");
    const previous = await client.query(
      "select checksum from najd_migrations.applied where name=$1",
      [file],
    );
    if (previous.rows.length) {
      if (previous.rows[0].checksum !== checksum)
        throw Error("Applied migration was modified: " + file);
      console.log("Already applied:", file);
      continue;
    }
    await client.query("begin");
    try {
      await client.query(source);
      await client.query(
        "insert into najd_migrations.applied(name,checksum) values($1,$2)",
        [file, checksum],
      );
      await client.query("commit");
      console.log("Applied:", file);
    } catch (error) {
      await client.query("rollback");
      throw error;
    }
  }
  const result = await client.query(
    "select b.name,br.name as branch from public.businesses b join public.branches br on br.business_id=b.id join private.company_setup s on s.business_id=b.id order by br.name",
  );
  console.log("Configured company and branches:", JSON.stringify(result.rows));
} catch (error) {
  console.error("Migration failed:", error.code || "", error.message);
  process.exitCode = 1;
} finally {
  await client.end();
}
