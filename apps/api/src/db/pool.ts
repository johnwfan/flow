import { fileURLToPath } from "node:url";
import path from "node:path";
import dotenv from "dotenv";
import pg from "pg";

const { Pool } = pg;

const here = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.resolve(here, "../../../../.env"), quiet: true });

export function createPool(): pg.Pool {
  const rawUrl = process.env["TIGER_CLOUD_URL"];
  if (!rawUrl) {
    throw new Error("TIGER_CLOUD_URL is not set");
  }

  // `sslmode=require` means "encrypt, don't verify the cert" under libpq (what
  // psql uses), but `pg` parses it into a real certificate-verification request
  // and rejects Tiger Cloud's cert chain. Strip it from the URL and set the
  // equivalent behavior explicitly instead of relying on pg's URL parsing.
  const url = new URL(rawUrl);
  const usesSsl = url.searchParams.has("sslmode");
  url.searchParams.delete("sslmode");

  return new Pool({
    connectionString: url.toString(),
    ssl: usesSsl ? { rejectUnauthorized: false } : undefined,
  });
}
