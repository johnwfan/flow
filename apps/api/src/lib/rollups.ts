import type { Pool } from "pg";
import { State } from "@flow/shared";

export interface StateRibbonSegment {
  state: string;
  startedAt: string;
  endedAt: string;
  durationS: number;
}

export interface SessionSummary {
  id: string;
  deviceId: string;
  startedAt: string;
  endedAt: string | null;
  durationS: number | null;
  narrative: string | null;
  focusTimeS: number;
  stateRibbon: StateRibbonSegment[];
}

export interface TimelineBucket {
  bucket: string;
  avgPulseBpm: number | null;
  avgBreathingRpm: number | null;
  avgHrvMs: number | null;
  avgEdaUs: number | null;
  state: string;
}

interface BucketRow {
  bucket: Date;
  avg_pulse_bpm: string | null;
  avg_breathing_rpm: string | null;
  avg_hrv_ms: string | null;
  avg_eda_us: string | null;
  state: string;
}

function toRibbon(buckets: BucketRow[], bucketSeconds: number): StateRibbonSegment[] {
  const segments: StateRibbonSegment[] = [];
  for (const row of buckets) {
    const last = segments[segments.length - 1];
    if (last && last.state === row.state) {
      last.durationS += bucketSeconds;
      last.endedAt = new Date(row.bucket.getTime() + bucketSeconds * 1000).toISOString();
    } else {
      segments.push({
        state: row.state,
        startedAt: row.bucket.toISOString(),
        endedAt: new Date(row.bucket.getTime() + bucketSeconds * 1000).toISOString(),
        durationS: bucketSeconds,
      });
    }
  }
  return segments;
}

async function fetchBuckets(pool: Pool, sessionId: string, table: "samples_1min" | "samples_5min") {
  const result = await pool.query<BucketRow>(
    `SELECT bucket, avg_pulse_bpm, avg_breathing_rpm, avg_hrv_ms, avg_eda_us, state
     FROM ${table}
     WHERE session_id = $1
     ORDER BY bucket ASC`,
    [sessionId],
  );
  return result.rows;
}

export async function getSessionSummary(pool: Pool, sessionId: string): Promise<SessionSummary | null> {
  const sessionResult = await pool.query<{
    id: string;
    device_id: string;
    started_at: Date;
    ended_at: Date | null;
    duration_s: number | null;
    narrative: string | null;
  }>(
    "SELECT id, device_id, started_at, ended_at, duration_s, narrative FROM sessions WHERE id = $1",
    [sessionId],
  );
  const session = sessionResult.rows[0];
  if (!session) return null;

  const buckets = await fetchBuckets(pool, sessionId, "samples_1min");
  const stateRibbon = toRibbon(buckets, 60);
  const focusTimeS = stateRibbon
    .filter((s) => s.state === State.Focused)
    .reduce((sum, s) => sum + s.durationS, 0);

  return {
    id: session.id,
    deviceId: session.device_id,
    startedAt: session.started_at.toISOString(),
    endedAt: session.ended_at ? session.ended_at.toISOString() : null,
    durationS: session.duration_s,
    narrative: session.narrative,
    focusTimeS,
    stateRibbon,
  };
}

export async function listSessionSummaries(pool: Pool, deviceId?: string): Promise<SessionSummary[]> {
  const clauses = ["ended_at IS NOT NULL"];
  const params: string[] = [];
  if (deviceId) {
    params.push(deviceId);
    clauses.push("device_id = $1");
  }

  const sessionResult = await pool.query<{ id: string }>(
    `SELECT id FROM sessions WHERE ${clauses.join(" AND ")} ORDER BY started_at DESC`,
    params,
  );

  // Was a sequential await-in-loop -- one DB round trip per session, in
  // series, against a remote Tiger Cloud instance. With dozens of sessions
  // that's dozens of round trips end to end, which is exactly why this
  // list was slow to load. Promise.all lets pg's pool (default max 10)
  // run them concurrently instead of one at a time; order is preserved
  // since Promise.all resolves in input order regardless of completion
  // order.
  const results = await Promise.all(sessionResult.rows.map((row) => getSessionSummary(pool, row.id)));
  return results.filter((s): s is SessionSummary => s !== null);
}

export async function getSessionTimeline(pool: Pool, sessionId: string, durationS: number | null): Promise<TimelineBucket[]> {
  const useFineGrained = (durationS ?? 0) <= 60 * 60;
  const buckets = await fetchBuckets(pool, sessionId, useFineGrained ? "samples_1min" : "samples_5min");

  return buckets.map((row) => ({
    bucket: row.bucket.toISOString(),
    avgPulseBpm: row.avg_pulse_bpm === null ? null : Number(row.avg_pulse_bpm),
    avgBreathingRpm: row.avg_breathing_rpm === null ? null : Number(row.avg_breathing_rpm),
    avgHrvMs: row.avg_hrv_ms === null ? null : Number(row.avg_hrv_ms),
    avgEdaUs: row.avg_eda_us === null ? null : Number(row.avg_eda_us),
    state: row.state,
  }));
}
