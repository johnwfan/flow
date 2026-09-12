import type { FastifyInstance } from "fastify";
import type { PoolClient } from "pg";
import type {
  SampleMessage,
  AppContextMessage,
  StateMessage,
  AlertMessage,
  ThoughtProbeMessage,
} from "@flow/shared";
import { pool } from "./db.js";

interface BatchRequestBody {
  batch_key: string;
  samples?: SampleMessage[];
  context_intervals?: AppContextMessage[];
  states?: StateMessage[];
  alerts?: (AlertMessage & { response?: string | null })[];
  probes?: ThoughtProbeMessage[];
}

function isForeignKeyViolation(err: unknown): boolean {
  return typeof err === "object" && err !== null && (err as { code?: string }).code === "23503";
}

// samples/context_intervals/probes have no array-typed columns, so a plain
// unnest() bulk insert works directly.

async function insertSamples(client: PoolClient, sessionId: string, samples: SampleMessage[]) {
  if (samples.length === 0) return 0;
  const { rowCount } = await client.query(
    `INSERT INTO samples (session_id, ts, pulse_bpm, breathing_rpm, hrv_ms, eda_us, conf, blink, talking)
     SELECT $1, * FROM unnest(
       $2::timestamptz[], $3::real[], $4::real[], $5::real[],
       $6::real[], $7::real[], $8::text[], $9::text[]
     ) AS t(ts, pulse_bpm, breathing_rpm, hrv_ms, eda_us, conf, blink, talking)`,
    [
      sessionId,
      samples.map((s) => new Date(s.ts)),
      samples.map((s) => s.pulse_bpm),
      samples.map((s) => s.breathing_rpm),
      samples.map((s) => s.hrv_ms),
      samples.map((s) => s.eda_us),
      samples.map((s) => s.conf),
      samples.map((s) => s.blink),
      samples.map((s) => s.talking),
    ],
  );
  return rowCount ?? 0;
}

async function insertContextIntervals(
  client: PoolClient,
  sessionId: string,
  contexts: AppContextMessage[],
) {
  if (contexts.length === 0) return 0;
  const { rowCount } = await client.query(
    `INSERT INTO context_intervals (session_id, time, app, category)
     SELECT $1, * FROM unnest($2::timestamptz[], $3::text[], $4::text[])
       AS t(time, app, category)`,
    [
      sessionId,
      contexts.map((c) => new Date(c.ts)),
      contexts.map((c) => c.app_title),
      contexts.map((c) => c.category),
    ],
  );
  return rowCount ?? 0;
}

async function insertProbes(client: PoolClient, sessionId: string, probes: ThoughtProbeMessage[]) {
  if (probes.length === 0) return 0;
  const { rowCount } = await client.query(
    `INSERT INTO probes (session_id, time, predicted_state, answer)
     SELECT $1, * FROM unnest($2::timestamptz[], $3::text[], $4::text[])
       AS t(time, predicted_state, answer)`,
    [
      sessionId,
      probes.map((p) => new Date(p.ts)),
      probes.map((p) => p.classifier_state),
      probes.map((p) => p.user_response ?? null),
    ],
  );
  return rowCount ?? 0;
}

// states/alerts carry a per-row `reasons: string[]` of variable length.
// Postgres native arrays must be rectangular, so a plain unnest() over a
// text[][] parameter doesn't work here -- pass reasons as jsonb instead and
// convert back to text[] per row inside the query.

async function insertStates(client: PoolClient, sessionId: string, states: StateMessage[]) {
  if (states.length === 0) return 0;
  const { rowCount } = await client.query(
    `INSERT INTO states (session_id, since, state, confidence, reasons)
     SELECT $1, t.since, t.state, t.confidence,
       ARRAY(SELECT jsonb_array_elements_text(t.reasons))
     FROM unnest($2::timestamptz[], $3::text[], $4::real[], $5::jsonb[])
       AS t(since, state, confidence, reasons)`,
    [
      sessionId,
      states.map((s) => new Date(s.ts)),
      states.map((s) => s.state),
      states.map((s) => s.confidence),
      states.map((s) => JSON.stringify(s.reasons ?? [])),
    ],
  );
  return rowCount ?? 0;
}

async function insertAlerts(
  client: PoolClient,
  sessionId: string,
  alerts: (AlertMessage & { response?: string | null })[],
) {
  if (alerts.length === 0) return 0;
  const { rowCount } = await client.query(
    `INSERT INTO alerts (session_id, time, kind, reasons, duration_s, response)
     SELECT $1, t.time, t.kind,
       ARRAY(SELECT jsonb_array_elements_text(t.reasons)),
       t.duration_s, t.response
     FROM unnest($2::timestamptz[], $3::text[], $4::jsonb[], $5::real[], $6::text[])
       AS t(time, kind, reasons, duration_s, response)`,
    [
      sessionId,
      alerts.map((a) => new Date(a.ts)),
      alerts.map((a) => a.type),
      alerts.map((a) => JSON.stringify(a.reasons ?? [])),
      alerts.map((a) => a.duration_s),
      alerts.map((a) => a.response ?? null),
    ],
  );
  return rowCount ?? 0;
}

export function registerIngestRoutes(app: FastifyInstance) {
  app.post<{ Body: { device_id: string } }>(
    "/v1/devices",
    {
      schema: {
        body: {
          type: "object",
          required: ["device_id"],
          properties: { device_id: { type: "string", minLength: 1 } },
        },
      },
    },
    async (request) => {
      const { device_id } = request.body;
      await pool.query(
        "INSERT INTO devices (device_id) VALUES ($1) ON CONFLICT (device_id) DO NOTHING",
        [device_id],
      );
      return { device_id };
    },
  );

  app.post<{ Body: { device_id: string; label?: string } }>(
    "/v1/sessions",
    {
      schema: {
        body: {
          type: "object",
          required: ["device_id"],
          properties: {
            device_id: { type: "string", minLength: 1 },
            label: { type: "string" },
          },
        },
      },
    },
    async (request, reply) => {
      const { device_id, label } = request.body;
      try {
        const { rows } = await pool.query(
          `INSERT INTO sessions (device_id, label, started_at)
           VALUES ($1, $2, now())
           RETURNING id, started_at`,
          [device_id, label ?? null],
        );
        return rows[0];
      } catch (err) {
        if (isForeignKeyViolation(err)) {
          reply.code(404);
          return { error: `device ${device_id} not found` };
        }
        throw err;
      }
    },
  );

  app.post<{ Params: { id: string } }>("/v1/sessions/:id/end", async (request, reply) => {
    const { id } = request.params;
    const { rows } = await pool.query(
      `UPDATE sessions SET ended_at = now()
       WHERE id = $1 AND ended_at IS NULL
       RETURNING id, started_at, ended_at`,
      [id],
    );
    if (rows.length > 0) {
      return rows[0];
    }

    // Either already ended (no-op, return current state) or doesn't exist.
    const existing = await pool.query(
      "SELECT id, started_at, ended_at FROM sessions WHERE id = $1",
      [id],
    );
    if (existing.rows.length === 0) {
      reply.code(404);
      return { error: "session not found" };
    }
    return existing.rows[0];
  });

  app.post<{ Params: { id: string }; Body: BatchRequestBody }>(
    "/v1/sessions/:id/batch",
    {
      schema: {
        body: {
          type: "object",
          required: ["batch_key"],
          properties: {
            batch_key: { type: "string", minLength: 1 },
            samples: { type: "array", items: { type: "object" } },
            context_intervals: { type: "array", items: { type: "object" } },
            states: { type: "array", items: { type: "object" } },
            alerts: { type: "array", items: { type: "object" } },
            probes: { type: "array", items: { type: "object" } },
          },
        },
      },
    },
    async (request, reply) => {
      const { id: sessionId } = request.params;
      const {
        batch_key,
        samples = [],
        context_intervals = [],
        states = [],
        alerts = [],
        probes = [],
      } = request.body;

      const sessionCheck = await pool.query("SELECT 1 FROM sessions WHERE id = $1", [sessionId]);
      if (sessionCheck.rows.length === 0) {
        reply.code(404);
        return { error: "session not found" };
      }

      const client = await pool.connect();
      try {
        await client.query("BEGIN");

        const marker = await client.query(
          `INSERT INTO processed_batches (session_id, batch_key)
           VALUES ($1, $2) ON CONFLICT DO NOTHING RETURNING batch_key`,
          [sessionId, batch_key],
        );

        if (marker.rows.length === 0) {
          await client.query("COMMIT");
          return {
            batch_key,
            duplicate: true,
            inserted: { samples: 0, context_intervals: 0, states: 0, alerts: 0, probes: 0 },
          };
        }

        const inserted = {
          samples: await insertSamples(client, sessionId, samples),
          context_intervals: await insertContextIntervals(client, sessionId, context_intervals),
          states: await insertStates(client, sessionId, states),
          alerts: await insertAlerts(client, sessionId, alerts),
          probes: await insertProbes(client, sessionId, probes),
        };

        await client.query("COMMIT");
        return { batch_key, duplicate: false, inserted };
      } catch (err) {
        await client.query("ROLLBACK");
        throw err;
      } finally {
        client.release();
      }
    },
  );
}
