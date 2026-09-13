import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import dotenv from "dotenv";
import Fastify from "fastify";
import cors from "@fastify/cors";
import { createPool } from "./db/pool.js";
import { healthRoutes } from "./routes/health.js";
import { sessionRoutes } from "./routes/sessions.js";
import { batchRoutes } from "./routes/batch.js";
import { insightsRoutes } from "./routes/insights.js";
import { speakRoutes } from "./routes/speak.js";

// Resolve .env relative to the repo root (matching apps/web/next.config.js and
// apps/api/src/db/pool.ts), not process.cwd(), so it loads the same via
// `pnpm dev`, `node dist/index.js`, or Docker regardless of cwd.
const scriptDir = dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: join(scriptDir, "..", "..", "..", ".env"), quiet: true });

const app = Fastify({ logger: true });

try {
  await app.register(cors);

  // Surface missing config early and clearly, rather than failing deep
  // inside a Gemini/ElevenLabs/DB call the first time a route needs it.
  for (const key of ["GEMINI_API_KEY", "ELEVENLABS_API_KEY", "TIGER_CLOUD_URL"]) {
    if (!process.env[key]) {
      console.warn(`[api] ${key} not set — routes depending on it will fail. See .env.example`);
    }
  }

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
