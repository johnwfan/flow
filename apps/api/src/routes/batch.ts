import type { FastifyInstance } from "fastify";
import { insertBatch } from "../lib/batchInsert.js";
import type { BatchBody } from "../types.js";

export async function batchRoutes(app: FastifyInstance): Promise<void> {
  app.post<{ Params: { id: string }; Body: BatchBody }>("/v1/sessions/:id/batch", async (request, reply) => {
    const sessionId = request.params.id;
    const body = request.body;

    if (!body.batchKey) {
      return reply.code(400).send({ error: "batchKey is required" });
    }

    const sessionResult = await app.pg.query<{ device_id: string }>(
      "SELECT device_id FROM sessions WHERE id = $1",
      [sessionId],
    );
    const session = sessionResult.rows[0];
    if (!session) {
      return reply.code(404).send({ error: "session not found" });
    }

    const result = await insertBatch(app.pg, sessionId, session.device_id, {
      batchKey: body.batchKey,
      samples: body.samples ?? [],
      events: body.events ?? [],
      contexts: body.contexts ?? [],
      probes: body.probes ?? [],
    });

    return reply.code(200).send(result);
  });
}
