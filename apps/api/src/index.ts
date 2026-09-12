import Fastify from "fastify";
import cors from "@fastify/cors";
import { State } from "@flow/shared";
import { pool } from "./db.js";
import { registerIngestRoutes } from "./ingest.js";

const app = Fastify({ logger: true });

await app.register(cors);

registerIngestRoutes(app);

app.get("/health", async () => {
  return { status: "ok", defaultState: State.Warmup };
});

app.get("/v1/health", async (_request, reply) => {
  try {
    await pool.query("SELECT 1");
    return { db_connected: true };
  } catch (err) {
    app.log.error(err);
    reply.code(503);
    return {
      db_connected: false,
      error: err instanceof Error ? err.message : String(err),
    };
  }
});

const port = Number(process.env["PORT"] ?? 3001);

try {
  await app.listen({ port, host: "0.0.0.0" });
  console.log(`API listening on :${port}`);
} catch (err) {
  app.log.error(err);
  process.exit(1);
}
