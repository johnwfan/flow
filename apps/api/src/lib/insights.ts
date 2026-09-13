import type { Pool } from "pg";
import { Category, State } from "@flow/shared";
import { categorizeAppTitles } from "./categorize.js";

function deviceFilter(deviceId?: string): { clause: string; params: string[] } {
  return deviceId ? { clause: "WHERE device_id = $1", params: [deviceId] } : { clause: "", params: [] };
}

export interface FocusWindow {
  medianMinutes: number | null;
  decayCurve: { minute: number; pctStillFocused: number }[];
}

/** "Focus window": how long, on average, a session stays in Focused before its first drop-off. */
export async function computeFocusWindow(pool: Pool, deviceId?: string): Promise<FocusWindow> {
  const { clause, params } = deviceFilter(deviceId);
  const sessions = await pool.query<{ id: string }>(`SELECT id FROM sessions ${clause}`, params);

  const dropoffMinutes: number[] = [];
  const minuteBuckets = new Map<number, { total: number; stillFocused: number }>();

  for (const session of sessions.rows) {
    const buckets = await pool.query<{ minute: number; state: string }>(
      `SELECT extract(epoch FROM (bucket - min(bucket) OVER ())) / 60 AS minute, state
       FROM samples_1min WHERE session_id = $1 ORDER BY bucket ASC`,
      [session.id],
    );

    let dropoffMinute: number | null = null;
    for (const row of buckets.rows) {
      const minute = Math.floor(row.minute);
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

  const points: SettlePoint[] = [];
  for (const session of sessions.rows) {
    const firstFocused = await pool.query<{ bucket: Date }>(
      `SELECT bucket FROM samples_1min WHERE session_id = $1 AND state = $2 ORDER BY bucket ASC LIMIT 1`,
      [session.id, State.Focused],
    );
    const bucket = firstFocused.rows[0]?.bucket;
    const settleSeconds = bucket ? Math.round((bucket.getTime() - session.started_at.getTime()) / 1000) : null;
    points.push({ sessionId: session.id, date: session.started_at.toISOString(), settleSeconds });
  }
  return points;
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

  let restorative = 0;
  let depleting = 0;
  let pendingResume: { sessionId: string; ts: Date } | null = null;

  for (const row of controlEvents.rows) {
    if (row.payload.action === "resume") {
      pendingResume = { sessionId: row.session_id, ts: row.ts };
      continue;
    }
    if (row.payload.action !== "pause" || !pendingResume) continue;

    const { sessionId, ts } = pendingResume;
    pendingResume = null;

    const focusedAfter = await pool.query<{ bucket: Date }>(
      `SELECT bucket FROM samples_1min
       WHERE session_id = $1 AND state = $2 AND bucket >= $3::timestamptz AND bucket <= $3::timestamptz + interval '3 minutes'
       LIMIT 1`,
      [sessionId, State.Focused, ts],
    );
    if (focusedAfter.rows.length > 0) restorative += 1;
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
  const sessionFilter = clause ? `AND session_id IN (SELECT id FROM sessions ${clause})` : "";

  const alerts = await pool.query<{ session_id: string; ts: Date }>(
    `SELECT session_id, ts FROM events WHERE kind = 'alert' ${sessionFilter} ORDER BY ts ASC`,
    params,
  );

  const points: InterventionEfficacyPoint[] = [];
  for (const alert of alerts.rows) {
    const before = await pool.query<{ avg: string | null }>(
      `SELECT avg(breathing_rpm) FROM samples WHERE session_id = $1 AND ts BETWEEN $2::timestamptz - interval '2 minutes' AND $2::timestamptz`,
      [alert.session_id, alert.ts],
    );
    const after = await pool.query<{ avg: string | null }>(
      `SELECT avg(breathing_rpm) FROM samples WHERE session_id = $1 AND ts BETWEEN $2::timestamptz AND $2::timestamptz + interval '2 minutes'`,
      [alert.session_id, alert.ts],
    );

    points.push({
      ts: alert.ts.toISOString(),
      breathingRpmBefore: before.rows[0]?.avg ? Number(before.rows[0].avg) : null,
      breathingRpmAfter: after.rows[0]?.avg ? Number(after.rows[0].avg) : null,
    });
  }
  return points;
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
