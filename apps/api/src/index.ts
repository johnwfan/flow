import Fastify from "fastify";
import cors from "@fastify/cors";
import { createPool } from "./db/pool.js";
import { healthRoutes } from "./routes/health.js";
import { sessionRoutes } from "./routes/sessions.js";
import { batchRoutes } from "./routes/batch.js";
import { insightsRoutes } from "./routes/insights.js";
import { speakRoutes } from "./routes/speak.js";

const app = Fastify({ logger: true });

try {
  await app.register(cors);

  const pool = createPool();
  await pool.query("SELECT 1");
  app.decorate("pg", pool);
  app.addHook("onClose", async () => {
    await pool.end();
  });

  await app.register(healthRoutes);
  await app.register(sessionRoutes);
  await app.register(batchRoutes);
  await app.register(insightsRoutes);
  await app.register(speakRoutes);

  const port = Number(process.env["PORT"] ?? 3001);
  await app.listen({ port, host: "0.0.0.0" });
  console.log(`API listening on :${port}`);
} catch (err) {
  app.log.error(err);
  process.exit(1);
}
