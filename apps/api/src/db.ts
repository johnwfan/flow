import { fileURLToPath } from "node:url";
import path from "node:path";
import dotenv from "dotenv";
import { Pool } from "pg";

const here = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.resolve(here, "../../../.env"), quiet: true });

const rawUrl = process.env["DATABASE_URL"];

if (!rawUrl) {
  throw new Error("DATABASE_URL is not set");
}

// `sslmode=require` means "encrypt, don't verify the cert" under libpq (what
// psql uses), but `pg` parses it into a real certificate-verification request
// and rejects Tiger Cloud's cert chain. Strip it from the URL and set the
// equivalent behavior explicitly instead of relying on pg's URL parsing.
const url = new URL(rawUrl);
url.searchParams.delete("sslmode");

export const pool = new Pool({
  connectionString: url.toString(),
  ssl: { rejectUnauthorized: false },
});
