import Fastify from "fastify";
import cors from "@fastify/cors";
import { State } from "@flow/shared";

const app = Fastify({ logger: true });

await app.register(cors);

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
