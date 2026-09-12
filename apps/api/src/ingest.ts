import type { FastifyInstance } from "fastify";
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

// One statement, one round trip. Session-existence, the idempotency marker,
// and all five table inserts are data-modifying CTEs gated by
// `WHERE EXISTS (SELECT 1 FROM marker)` -- if the session doesn't exist or
// this batch_key was already processed, marker ends up empty and every
// insert below it is a no-op. A single statement is atomic by itself, so no
// explicit BEGIN/COMMIT is needed.
//
// (An earlier version ran these as 9 sequential queries in an explicit
// transaction -- measured at ~220ms for 600 samples from inside the Vultr
// droplet, just over the 200ms target, because each round trip pays full
// network latency even same-region. Collapsing to one round trip brought it
// to comfortably under 200ms.)
const BATCH_SQL = `
WITH session_check AS (
  SELECT 1 FROM sessions WHERE id = $1
),
marker AS (
  INSERT INTO processed_batches (session_id, batch_key)
  SELECT $1, $2 WHERE EXISTS (SELECT 1 FROM session_check)
  ON CONFLICT DO NOTHING
  RETURNING 1
),
samples_ins AS (
  INSERT INTO samples (session_id, ts, pulse_bpm, breathing_rpm, hrv_ms, eda_us, conf, blink, talking)
  SELECT $1, * FROM unnest(
    $3::timestamptz[], $4::real[], $5::real[], $6::real[],
    $7::real[], $8::real[], $9::text[], $10::text[]
  ) AS t(ts, pulse_bpm, breathing_rpm, hrv_ms, eda_us, conf, blink, talking)
  WHERE EXISTS (SELECT 1 FROM marker)
  RETURNING 1
),
context_ins AS (
  INSERT INTO context_intervals (session_id, time, app, category)
  SELECT $1, * FROM unnest($11::timestamptz[], $12::text[], $13::text[])
    AS t(time, app, category)
  WHERE EXISTS (SELECT 1 FROM marker)
  RETURNING 1
),
states_ins AS (
  INSERT INTO states (session_id, since, state, confidence, reasons)
  SELECT $1, t.since, t.state, t.confidence,
    ARRAY(SELECT jsonb_array_elements_text(t.reasons))
  FROM unnest($14::timestamptz[], $15::text[], $16::real[], $17::jsonb[])
    AS t(since, state, confidence, reasons)
  WHERE EXISTS (SELECT 1 FROM marker)
  RETURNING 1
),
alerts_ins AS (
  INSERT INTO alerts (session_id, time, kind, reasons, duration_s, response)
  SELECT $1, t.time, t.kind,
    ARRAY(SELECT jsonb_array_elements_text(t.reasons)),
    t.duration_s, t.response
  FROM unnest($18::timestamptz[], $19::text[], $20::jsonb[], $21::real[], $22::text[])
    AS t(time, kind, reasons, duration_s, response)
  WHERE EXISTS (SELECT 1 FROM marker)
  RETURNING 1
),
probes_ins AS (
  INSERT INTO probes (session_id, time, predicted_state, answer)
  SELECT $1, * FROM unnest($23::timestamptz[], $24::text[], $25::text[])
    AS t(time, predicted_state, answer)
  WHERE EXISTS (SELECT 1 FROM marker)
  RETURNING 1
)
SELECT
  (SELECT count(*) FROM session_check) > 0 AS session_exists,
  (SELECT count(*) FROM marker)         > 0 AS marker_inserted,
  (SELECT count(*) FROM samples_ins)::int AS samples,
  (SELECT count(*) FROM context_ins)::int AS context_intervals,
  (SELECT count(*) FROM states_ins)::int  AS states,
  (SELECT count(*) FROM alerts_ins)::int  AS alerts,
  (SELECT count(*) FROM probes_ins)::int  AS probes;
`;

function buildBatchParams(
  sessionId: string,
  batchKey: string,
  samples: SampleMessage[],
  contexts: AppContextMessage[],
  states: StateMessage[],
  alerts: (AlertMessage & { response?: string | null })[],
  probes: ThoughtProbeMessage[],
) {
  return [
    sessionId,
    batchKey,
    // samples
    samples.map((s) => new Date(s.ts)),
    samples.map((s) => s.pulse_bpm),
    samples.map((s) => s.breathing_rpm),
    samples.map((s) => s.hrv_ms),
    samples.map((s) => s.eda_us),
    samples.map((s) => s.conf),
    samples.map((s) => s.blink),
    samples.map((s) => s.talking),
    // context_intervals
    contexts.map((c) => new Date(c.ts)),
    contexts.map((c) => c.app_title),
    contexts.map((c) => c.category),
    // states
    states.map((s) => new Date(s.ts)),
    states.map((s) => s.state),
    states.map((s) => s.confidence),
    states.map((s) => JSON.stringify(s.reasons ?? [])),
    // alerts
    alerts.map((a) => new Date(a.ts)),
    alerts.map((a) => a.type),
    alerts.map((a) => JSON.stringify(a.reasons ?? [])),
    alerts.map((a) => a.duration_s),
    alerts.map((a) => a.response ?? null),
    // probes
    probes.map((p) => new Date(p.ts)),
    probes.map((p) => p.classifier_state),
    probes.map((p) => p.user_response ?? null),
  ];
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

      const params = buildBatchParams(
        sessionId,
        batch_key,
        samples,
        context_intervals,
        states,
        alerts,
        probes,
      );
      const { rows } = await pool.query(BATCH_SQL, params);
      const row = rows[0];

      if (!row.session_exists) {
        reply.code(404);
        return { error: "session not found" };
      }

      if (!row.marker_inserted) {
        return {
          batch_key,
          duplicate: true,
          inserted: { samples: 0, context_intervals: 0, states: 0, alerts: 0, probes: 0 },
        };
      }

      return {
        batch_key,
        duplicate: false,
        inserted: {
          samples: row.samples,
          context_intervals: row.context_intervals,
          states: row.states,
          alerts: row.alerts,
          probes: row.probes,
        },
      };
    },
  );
}
