import type { FastifyInstance } from "fastify";
import { State } from "@flow/shared";

export async function healthRoutes(app: FastifyInstance): Promise<void> {
  const handler = async () => ({ status: "ok", defaultState: State.Warmup });

  app.get("/health", handler);
  app.get("/v1/health", handler);
}
