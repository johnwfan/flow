import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import dotenv from "dotenv";
import Fastify from "fastify";
import cors from "@fastify/cors";
import { State } from "@flow/shared";

// Resolve .env relative to this file (apps/api/.env), not process.cwd(),
// so it loads the same via `pnpm dev`, `node dist/index.js`, or Docker.
const scriptDir = dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: join(scriptDir, "..", ".env") });

const app = Fastify({ logger: true });

await app.register(cors);

// Surface missing config early and clearly, rather than failing deep
// inside a Gemini/ElevenLabs/DB call the first time a route needs it.
for (const key of ["GEMINI_API_KEY", "ELEVENLABS_API_KEY", "TIGER_CLOUD_URL"]) {
  if (!process.env[key]) {
    console.warn(`[api] ${key} not set — routes depending on it will fail. See apps/api/.env.example`);
  }
}

app.get("/health", async () => {
  return { status: "ok", defaultState: State.Warmup };
});

const port = Number(process.env["PORT"] ?? 3001);

try {
  await app.listen({ port, host: "0.0.0.0" });
  console.log(`API listening on :${port}`);
} catch (err) {
  app.log.error(err);
  process.exit(1);
}
