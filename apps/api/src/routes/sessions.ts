import type { FastifyInstance } from "fastify";
import { getSessionSummary, getSessionTimeline, listSessionSummaries } from "../lib/rollups.js";
import { generateAndStoreNarrative } from "../lib/narrative.js";
import { computeDistractionStats, generateAndStoreTips, getStoredTips } from "../lib/sessionInsights.js";
import type { CreateSessionBody } from "../types.js";

interface EventRow {
  ts: Date;
  kind: string;
  payload: unknown;
}

async function getSessionEvents(app: FastifyInstance, sessionId: string): Promise<EventRow[]> {
  const result = await app.pg.query<EventRow>(
    "SELECT ts, kind, payload FROM events WHERE session_id = $1 ORDER BY ts ASC",
    [sessionId],
  );
  return result.rows;
}

export async function sessionRoutes(app: FastifyInstance): Promise<void> {
  app.post<{ Body: CreateSessionBody }>("/v1/sessions", async (request, reply) => {
    const { deviceId } = request.body;
    if (!deviceId) {
      return reply.code(400).send({ error: "deviceId is required" });
    }

    const result = await app.pg.query<{ id: string }>(
      "INSERT INTO sessions (device_id, started_at) VALUES ($1, now()) RETURNING id",
      [deviceId],
    );

    return { sessionId: result.rows[0]!.id };
  });

  app.get<{ Querystring: { deviceId?: string } }>("/v1/sessions", async (request) => {
    const summaries = await listSessionSummaries(app.pg, request.query.deviceId);
    return { sessions: summaries };
  });

  app.get<{ Params: { id: string } }>("/v1/sessions/:id", async (request, reply) => {
    const summary = await getSessionSummary(app.pg, request.params.id);
    if (!summary) {
      return reply.code(404).send({ error: "session not found" });
    }

    const [timeline, events] = await Promise.all([
      getSessionTimeline(app.pg, summary.id, summary.durationS),
      getSessionEvents(app, summary.id),
    ]);

    const alerts = events.filter((e) => e.kind === "alert");
    const contexts = events.filter((e) => e.kind === "app_context");
    const probes = events.filter((e) => e.kind === "thought_probe");

    const [distraction, tips] = await Promise.all([
      computeDistractionStats(app.pg, summary.id, summary.stateRibbon),
      getStoredTips(app.pg, summary.id),
    ]);

    return { summary, timeline, alerts, contexts, probes, insights: { ...distraction, tips } };
  });

  app.delete<{ Params: { id: string } }>("/v1/sessions/:id", async (request, reply) => {
    const sessionId = request.params.id;
    const client = await app.pg.connect();

    try {
      await client.query("BEGIN");

      const existing = await client.query<{ id: string }>("SELECT id FROM sessions WHERE id = $1", [sessionId]);
      if (existing.rowCount === 0) {
        await client.query("ROLLBACK");
        return reply.code(404).send({ error: "session not found" });
      }

      await client.query("DELETE FROM events WHERE session_id = $1", [sessionId]);
      await client.query("DELETE FROM batch_keys WHERE session_id = $1", [sessionId]);
      await client.query("DELETE FROM samples WHERE session_id = $1", [sessionId]);
      await client.query("DELETE FROM sessions WHERE id = $1", [sessionId]);

      await client.query("COMMIT");
    } catch (err) {
      await client.query("ROLLBACK");
      throw err;
    } finally {
      client.release();
    }

    await app.pg.query("CALL refresh_continuous_aggregate('samples_1min', NULL, NULL)");
    await app.pg.query("CALL refresh_continuous_aggregate('samples_5min', NULL, NULL)");
    return reply.code(204).send();
  });

  app.post<{ Params: { id: string } }>("/v1/sessions/:id/end", async (request, reply) => {
    const sessionId = request.params.id;

    const updateResult = await app.pg.query<{ id: string }>(
      `UPDATE sessions
       SET ended_at = now(), duration_s = EXTRACT(EPOCH FROM (now() - started_at))::int
       WHERE id = $1
       RETURNING id`,
      [sessionId],
    );

    if (updateResult.rowCount === 0) {
      return reply.code(404).send({ error: "session not found" });
    }

    const summary = await getSessionSummary(app.pg, sessionId);
    if (!summary) {
      return reply.code(404).send({ error: "session not found" });
    }

    const narrative = await generateAndStoreNarrative(app.pg, sessionId, summary);
    const distraction = await computeDistractionStats(app.pg, sessionId, summary.stateRibbon);
    const tips = await generateAndStoreTips(app.pg, sessionId, summary, distraction);

    return { sessionId, durationS: summary.durationS, narrative, tips };
  });
}
