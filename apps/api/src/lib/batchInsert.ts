import type { Pool } from "pg";
import { State } from "@flow/shared";
import type { BatchBody } from "../types.js";

interface StateChange {
  ts: number;
  state: string;
}

interface ContextChange {
  ts: number;
  category: string | null;
  appTitle: string | null;
}

function buildInsert(table: string, columns: string[], rows: unknown[][]): { text: string; values: unknown[] } {
  const values: unknown[] = [];
  const rowPlaceholders = rows.map((row) => {
    const placeholders = row.map((value) => {
      values.push(value);
      return `$${values.length}`;
    });
    return `(${placeholders.join(", ")})`;
  });

  return {
    text: `INSERT INTO ${table} (${columns.join(", ")}) VALUES ${rowPlaceholders.join(", ")}`,
    values,
  };
}

/** Finds the value carried forward as of `ts`, walking a sorted-by-ts changes array with a resumable cursor. */
function advanceCursor<T extends { ts: number }>(changes: T[], cursor: number, ts: number): [T | undefined, number] {
  let latest: T | undefined;
  let i = cursor;
  while (i < changes.length && changes[i]!.ts <= ts) {
    latest = changes[i];
    i += 1;
  }
  return [latest, i];
}

export async function insertBatch(
  pool: Pool,
  sessionId: string,
  deviceId: string,
  body: BatchBody,
): Promise<{ deduped: boolean }> {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    const dedupResult = await client.query(
      "INSERT INTO batch_keys (session_id, batch_key) VALUES ($1, $2) ON CONFLICT DO NOTHING RETURNING session_id",
      [sessionId, body.batchKey],
    );

    if (dedupResult.rowCount === 0) {
      await client.query("ROLLBACK");
      return { deduped: true };
    }

    const lastKnown = await client.query<{ state: string; category: string | null; app_title: string | null }>(
      "SELECT state, category, app_title FROM samples WHERE session_id = $1 ORDER BY ts DESC LIMIT 1",
      [sessionId],
    );
    let carriedState = lastKnown.rows[0]?.state ?? State.Warmup;
    let carriedCategory = lastKnown.rows[0]?.category ?? null;
    let carriedAppTitle = lastKnown.rows[0]?.app_title ?? null;

    const stateChanges: StateChange[] = body.events
      .filter((e) => e.kind === "state")
      .map((e) => ({ ts: e.ts, state: (e.payload as { state: string }).state }))
      .sort((a, b) => a.ts - b.ts);

    const contextChanges: ContextChange[] = body.contexts
      .map((c) => ({ ts: c.ts, category: c.category, appTitle: c.app_title }))
      .sort((a, b) => a.ts - b.ts);

    const sortedSamples = [...body.samples].sort((a, b) => a.ts - b.ts);

    const sampleColumns = [
      "session_id",
      "device_id",
      "ts",
      "pulse_bpm",
      "breathing_rpm",
      "hrv_ms",
      "eda_us",
      "conf",
      "blink",
      "talking",
      "state",
      "category",
      "app_title",
    ];
    const sampleRows: unknown[][] = [];

    let stateCursor = 0;
    let contextCursor = 0;

    for (const sample of sortedSamples) {
      const [stateChange, nextStateCursor] = advanceCursor(stateChanges, stateCursor, sample.ts);
      stateCursor = nextStateCursor;
      if (stateChange) carriedState = stateChange.state;

      const [contextChange, nextContextCursor] = advanceCursor(contextChanges, contextCursor, sample.ts);
      contextCursor = nextContextCursor;
      if (contextChange) {
        carriedCategory = contextChange.category;
        carriedAppTitle = contextChange.appTitle;
      }

      sampleRows.push([
        sessionId,
        deviceId,
        new Date(sample.ts),
        sample.pulse_bpm,
        sample.breathing_rpm,
        sample.hrv_ms,
        sample.eda_us,
        sample.conf,
        sample.blink,
        sample.talking,
        carriedState,
        carriedCategory,
        carriedAppTitle,
      ]);
    }

    if (sampleRows.length > 0) {
      const insert = buildInsert(
        "samples",
        [...sampleColumns.map((c) => (c === "ts" ? "ts" : c))],
        sampleRows,
      );
      await client.query(insert.text, insert.values);
    }

    const eventColumns = ["session_id", "ts", "kind", "payload"];
    const eventRows: unknown[][] = [];

    for (const event of body.events) {
      eventRows.push([sessionId, new Date(event.ts), event.kind, JSON.stringify(event.payload)]);
    }
    for (const context of body.contexts) {
      eventRows.push([
        sessionId,
        new Date(context.ts),
        "app_context",
        JSON.stringify({ app_title: context.app_title, category: context.category }),
      ]);
    }
    for (const probe of body.probes) {
      eventRows.push([
        sessionId,
        new Date(probe.ts),
        "thought_probe",
        JSON.stringify({ classifier_state: probe.classifier_state, user_response: probe.user_response }),
      ]);
    }

    if (eventRows.length > 0) {
      const insert = buildInsert("events", eventColumns, eventRows);
      await client.query(insert.text, insert.values);
    }

    await client.query("COMMIT");
    return { deduped: false };
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }
}
