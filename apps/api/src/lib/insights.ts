import type { Pool } from "pg";
import { Category, State } from "@flow/shared";
import { categorizeAppTitles } from "./categorize.js";

function deviceFilter(deviceId?: string): { clause: string; params: string[] } {
  return deviceId
    ? { clause: "WHERE device_id = $1 AND ended_at IS NOT NULL", params: [deviceId] }
    : { clause: "WHERE ended_at IS NOT NULL", params: [] };
}

export interface FocusWindow {
  medianMinutes: number | null;
  decayCurve: { minute: number; pctStillFocused: number }[];
}

/** "Focus window": how long, on average, a session stays in Focused before its first drop-off. */
export async function computeFocusWindow(pool: Pool, deviceId?: string): Promise<FocusWindow> {
  const { clause, params } = deviceFilter(deviceId);
  const sessions = await pool.query<{ id: string }>(`SELECT id FROM sessions ${clause}`, params);
  const sessionIds = sessions.rows.map((s) => s.id);

  // Was one round trip per session (even parallelized, that's still a full
  // network round trip each, dozens of times, against a remote DB). A
  // single query with PARTITION BY session_id gets every session's buckets
  // -- with "minutes since THIS session's first bucket" preserved exactly
  // like the old per-session `OVER ()` did -- in one round trip instead.
  const allRows = sessionIds.length
    ? await pool.query<{ session_id: string; minute: number; state: string }>(
        `SELECT session_id,
                extract(epoch FROM (bucket - min(bucket) OVER (PARTITION BY session_id))) / 60 AS minute,
                state
         FROM samples_1min WHERE session_id = ANY($1::uuid[]) ORDER BY session_id, bucket ASC`,
        [sessionIds],
      )
    : { rows: [] };

  const bySession = new Map<string, { minute: number; state: string }[]>();
  for (const row of allRows.rows) {
    const arr = bySession.get(row.session_id) ?? [];
    arr.push(row);
    bySession.set(row.session_id, arr);
  }

  const dropoffMinutes: number[] = [];
  const minuteBuckets = new Map<number, { total: number; stillFocused: number }>();

  for (const rows of bySession.values()) {
    let firstFocusedMinute: number | null = null;
    let dropoffMinute: number | null = null;
    for (const row of rows) {
      const sessionMinute = Math.floor(row.minute);
      if (firstFocusedMinute === null) {
        if (row.state !== State.Focused) continue;
        firstFocusedMinute = sessionMinute;
      }

      const minute = sessionMinute - firstFocusedMinute;
      const entry = minuteBuckets.get(minute) ?? { total: 0, stillFocused: 0 };
      entry.total += 1;
      if (row.state === State.Focused) entry.stillFocused += 1;
      minuteBuckets.set(minute, entry);

      if (dropoffMinute === null && row.state !== State.Focused && minute > 0) {
        dropoffMinute = minute;
      }
    }
    if (dropoffMinute !== null) dropoffMinutes.push(dropoffMinute);
  }

  dropoffMinutes.sort((a, b) => a - b);
  const medianMinutes =
    dropoffMinutes.length === 0 ? null : dropoffMinutes[Math.floor(dropoffMinutes.length / 2)]!;

  const decayCurve = [...minuteBuckets.entries()]
    .sort(([a], [b]) => a - b)
    .map(([minute, { total, stillFocused }]) => ({
      minute,
      pctStillFocused: total === 0 ? 0 : Math.round((stillFocused / total) * 100),
    }));

  return { medianMinutes, decayCurve };
}

export interface SessionFocusPoint {
  sessionId: string;
  startedAt: string;
  pctFocused: number;
}

/**
 * One point per session: its start time and overall focused-%. Deliberately
 * NOT bucketed into dayparts here -- the API server's clock/timezone isn't
 * necessarily the user's, so time-of-day bucketing happens client-side from
 * each startedAt's browser-local hour (same pattern as computeSettleTrend
 * shipping raw per-session points for the frontend to render).
 */
export async function computeFocusByTime(pool: Pool, deviceId?: string): Promise<SessionFocusPoint[]> {
  const { clause, params } = deviceFilter(deviceId);
  const result = await pool.query<{ id: string; started_at: Date; pct_focused: string | null }>(
    `SELECT s.id, s.started_at,
            count(*) FILTER (WHERE m.state = $${params.length + 1})::float / NULLIF(count(*), 0) * 100 AS pct_focused
     FROM sessions s
     JOIN samples_1min m ON m.session_id = s.id
     ${clause}
     GROUP BY s.id, s.started_at`,
    [...params, State.Focused],
  );
  return result.rows
    .filter((r) => r.pct_focused !== null)
    .map((r) => ({
      sessionId: r.id,
      startedAt: r.started_at.toISOString(),
      pctFocused: Math.round(Number(r.pct_focused)),
    }));
}

export interface CategoryEffort {
  category: string;
  minutes: number;
}

export async function computeEffortByCategory(pool: Pool, deviceId?: string): Promise<CategoryEffort[]> {
  const { clause, params } = deviceFilter(deviceId);
  const sessionFilter = clause ? `AND s.session_id IN (SELECT id FROM sessions ${clause})` : "";

  const result = await pool.query<{ category: string | null; app_title: string | null; minutes: string }>(
    `SELECT s.category AS category, s.app_title AS app_title, count(*) AS minutes
     FROM samples_1min s
     WHERE s.category IS NOT NULL ${sessionFilter}
     GROUP BY s.category, s.app_title`,
    params,
  );

  const unknownTitles = [
    ...new Set(
      result.rows
        .filter((r) => r.category === Category.Unknown && r.app_title)
        .map((r) => r.app_title!),
    ),
  ];
  const reclassified = unknownTitles.length > 0 ? await categorizeAppTitles(unknownTitles) : new Map();

  const totals = new Map<string, number>();
  for (const row of result.rows) {
    const category =
      row.category === Category.Unknown && row.app_title
        ? (reclassified.get(row.app_title) ?? Category.Unknown)
        : (row.category ?? Category.Unknown);
    totals.set(category, (totals.get(category) ?? 0) + Number(row.minutes));
  }

  return [...totals.entries()]
    .map(([category, minutes]) => ({ category, minutes }))
    .sort((a, b) => b.minutes - a.minutes);
}

export interface SettlePoint {
  sessionId: string;
  date: string;
  settleSeconds: number | null;
}

/** Time from session start to the first 1-minute bucket in the Focused state. */
export async function computeSettleTrend(pool: Pool, deviceId?: string): Promise<SettlePoint[]> {
  const { clause, params } = deviceFilter(deviceId);
  const sessions = await pool.query<{ id: string; started_at: Date }>(
    `SELECT id, started_at FROM sessions ${clause} ORDER BY started_at ASC`,
    params,
  );

  // Was one round trip per session -- DISTINCT ON gets Postgres's own
  // "first row per group" in a single query across every session at once.
  const sessionIds = sessions.rows.map((s) => s.id);
  const firstFocused = sessionIds.length
    ? await pool.query<{ session_id: string; bucket: Date }>(
        `SELECT DISTINCT ON (session_id) session_id, bucket
         FROM samples_1min WHERE session_id = ANY($1::uuid[]) AND state = $2
         ORDER BY session_id, bucket ASC`,
        [sessionIds, State.Focused],
      )
    : { rows: [] };
  const firstFocusedBySession = new Map(firstFocused.rows.map((r) => [r.session_id, r.bucket]));

  return sessions.rows.map((session) => {
    const bucket = firstFocusedBySession.get(session.id);
    const settleSeconds = bucket ? Math.round((bucket.getTime() - session.started_at.getTime()) / 1000) : null;
    return { sessionId: session.id, date: session.started_at.toISOString(), settleSeconds };
  });
}

export interface BreakQuality {
  restorative: number;
  depleting: number;
}

/**
 * A "break" is a pause/resume pair (session_control events). Restorative if the
 * session returns to Focused within 3 minutes of resuming; depleting otherwise.
 */
export async function computeBreakQuality(pool: Pool, deviceId?: string): Promise<BreakQuality> {
  const { clause, params } = deviceFilter(deviceId);
  const sessionFilter = clause ? `AND session_id IN (SELECT id FROM sessions ${clause})` : "";

  const controlEvents = await pool.query<{ session_id: string; ts: Date; payload: { action: string } }>(
    `SELECT session_id, ts, payload FROM events WHERE kind = 'session_control' ${sessionFilter} ORDER BY session_id, ts ASC`,
    params,
  );

  // Pairing pause/resume events is inherently sequential (order matters),
  // but doesn't touch the DB -- collect the resume pairs first, then check
  // them all in one query below instead of one round trip each.
  const pendingPauseBySession = new Map<string, Date>();
  const resumePairs: { sessionId: string; ts: Date }[] = [];

  for (const row of controlEvents.rows) {
    if (row.payload.action === "pause") {
      pendingPauseBySession.set(row.session_id, row.ts);
      continue;
    }
    if (row.payload.action !== "resume" || !pendingPauseBySession.has(row.session_id)) continue;

    pendingPauseBySession.delete(row.session_id);
    resumePairs.push({ sessionId: row.session_id, ts: row.ts });
  }

  if (resumePairs.length === 0) return { restorative: 0, depleting: 0 };

  // Was one round trip per resume pair -- a VALUES list turns the whole
  // set into a single query, checked against samples_1min via EXISTS.
  const valuesSql = resumePairs.map((_, i) => `($${i * 2 + 1}::uuid, $${i * 2 + 2}::timestamptz)`).join(", ");
  const valuesParams = resumePairs.flatMap((p) => [p.sessionId, p.ts]);
  const focusedAfter = await pool.query<{ has_focused: boolean }>(
    `SELECT EXISTS (
       SELECT 1 FROM samples_1min m
       WHERE m.session_id = p.session_id AND m.state = $${valuesParams.length + 1}
         AND m.bucket >= p.resume_ts AND m.bucket <= p.resume_ts + interval '3 minutes'
     ) AS has_focused
     FROM (VALUES ${valuesSql}) AS p(session_id, resume_ts)`,
    [...valuesParams, State.Focused],
  );

  let restorative = 0;
  let depleting = 0;
  for (const result of focusedAfter.rows) {
    if (result.has_focused) restorative += 1;
    else depleting += 1;
  }

  return { restorative, depleting };
}

export interface InterventionEfficacyPoint {
  ts: string;
  breathingRpmBefore: number | null;
  breathingRpmAfter: number | null;
}

/**
 * Approximates intervention efficacy using the breathing-rate shift around each alert,
 * since inhale:exhale ratio itself isn't persisted in the batch/DB schema.
 */
export async function computeInterventionEfficacy(pool: Pool, deviceId?: string): Promise<InterventionEfficacyPoint[]> {
  const { clause, params } = deviceFilter(deviceId);
  const sessionFilter = clause ? `AND e.session_id IN (SELECT id FROM sessions ${clause})` : "";

  // Was two round trips per alert (even parallelized, still one network
  // round trip each). Correlated subqueries compute both averages for
  // every alert server-side in a single query -- no round trip per alert
  // at all.
  const result = await pool.query<{ ts: Date; avg_before: string | null; avg_after: string | null }>(
    `SELECT e.ts,
            (SELECT avg(breathing_rpm) FROM samples s WHERE s.session_id = e.session_id
               AND s.ts BETWEEN e.ts - interval '2 minutes' AND e.ts) AS avg_before,
            (SELECT avg(breathing_rpm) FROM samples s WHERE s.session_id = e.session_id
               AND s.ts BETWEEN e.ts AND e.ts + interval '2 minutes') AS avg_after
     FROM events e
     WHERE e.kind = 'alert' ${sessionFilter}
     ORDER BY e.ts ASC`,
    params,
  );

  return result.rows.map((row) => ({
    ts: row.ts.toISOString(),
    breathingRpmBefore: row.avg_before ? Number(row.avg_before) : null,
    breathingRpmAfter: row.avg_after ? Number(row.avg_after) : null,
  }));
}

export interface ValidationResult {
  confusionMatrix: Record<string, Record<string, number>>;
  n: number;
  agreementRate: number;
  falseAlarmRate: number;
}

const ALARM_STATES = new Set<string>([State.ZonedOut, State.Spiraling]);

export async function computeValidation(pool: Pool, deviceId?: string): Promise<ValidationResult> {
  const { clause, params } = deviceFilter(deviceId);
  const sessionFilter = clause ? `AND session_id IN (SELECT id FROM sessions ${clause})` : "";

  const probes = await pool.query<{ payload: { classifier_state: string; user_response: string | null } }>(
    `SELECT payload FROM events WHERE kind = 'thought_probe' ${sessionFilter}`,
    params,
  );

  const stateValues = new Set<string>(Object.values(State));
  const confusionMatrix: Record<string, Record<string, number>> = {};
  let agree = 0;
  let alarmCount = 0;
  let falseAlarms = 0;
  let n = 0;

  for (const row of probes.rows) {
    const { classifier_state: predicted, user_response } = row.payload;
    if (!user_response) continue;

    const actual = stateValues.has(user_response) ? user_response : "other";
    n += 1;
    confusionMatrix[actual] ??= {};
    confusionMatrix[actual]![predicted] = (confusionMatrix[actual]![predicted] ?? 0) + 1;

    if (predicted === actual) agree += 1;
    if (ALARM_STATES.has(predicted)) {
      alarmCount += 1;
      if (actual === State.Focused) falseAlarms += 1;
    }
  }

  return {
    confusionMatrix,
    n,
    agreementRate: n === 0 ? 0 : agree / n,
    falseAlarmRate: alarmCount === 0 ? 0 : falseAlarms / alarmCount,
  };
}
