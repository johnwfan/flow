import type { Pool } from "pg";
import { State } from "@flow/shared";
import { generateText } from "../clients/gemini.js";
import type { SessionSummary, StateRibbonSegment } from "./rollups.js";

const FALLBACK_TIPS = "Not enough signal yet to generate tips -- run a couple more sessions first.";

export interface DistractionWindow {
  startedAt: string;
  endedAt: string;
  durationS: number;
  /** Best-guess app active when this distraction period began, if known. */
  appTitle: string | null;
  category: string | null;
}

export interface AppDistraction {
  appTitle: string | null;
  category: string | null;
  minutes: number;
  episodes: number;
}

export interface SessionInsights {
  distractionPct: number; // 0-100, share of ribboned time spent zoned_out
  zoneOutEpisodes: number;
  spiralEpisodes: number;
  distractionWindows: DistractionWindow[]; // when it happened, in session order
  distractingApps: AppDistraction[]; // ranked, worst first
  tips: string | null; // Gemini-generated, stored on sessions.tips
}

interface AppContextRow {
  ts: Date;
  app_title: string | null;
  category: string | null;
}

async function getAppContextTimeline(pool: Pool, sessionId: string): Promise<AppContextRow[]> {
  const result = await pool.query<AppContextRow>(
    `SELECT ts, payload->>'app_title' AS app_title, payload->>'category' AS category
     FROM events WHERE session_id = $1 AND kind = 'app_context'
     ORDER BY ts ASC`,
    [sessionId],
  );
  return result.rows;
}

/** Finds the app_context in effect at `ts` (the last one at or before it). */
function appAt(timeline: AppContextRow[], ts: number): AppContextRow | undefined {
  let result: AppContextRow | undefined;
  for (const row of timeline) {
    if (row.ts.getTime() <= ts) result = row;
    else break;
  }
  return result;
}

/**
 * Real, deterministic numbers -- no LLM involved. Ribbon segments come from
 * the 1-min continuous aggregate (see rollups.ts), so episode boundaries
 * are accurate to ~1 minute, matching what the rest of the dashboard shows.
 */
export async function computeDistractionStats(
  pool: Pool,
  sessionId: string,
  ribbon: StateRibbonSegment[],
): Promise<Pick<SessionInsights, "distractionPct" | "zoneOutEpisodes" | "spiralEpisodes" | "distractionWindows" | "distractingApps">> {
  const totalS = ribbon.reduce((sum, s) => sum + s.durationS, 0);
  const zoneOutSegments = ribbon.filter((s) => s.state === State.ZonedOut);
  const spiralSegments = ribbon.filter((s) => s.state === State.Spiraling);

  const distractionPct = totalS > 0 ? (zoneOutSegments.reduce((sum, s) => sum + s.durationS, 0) / totalS) * 100 : 0;

  const contextTimeline = await getAppContextTimeline(pool, sessionId);

  const distractionWindows: DistractionWindow[] = zoneOutSegments.map((s) => {
    const app = appAt(contextTimeline, new Date(s.startedAt).getTime());
    return {
      startedAt: s.startedAt,
      endedAt: s.endedAt,
      durationS: s.durationS,
      appTitle: app?.app_title ?? null,
      category: app?.category ?? null,
    };
  });

  const byApp = new Map<string, AppDistraction>();
  for (const w of distractionWindows) {
    const key = `${w.appTitle ?? "unknown"}::${w.category ?? "unknown"}`;
    const existing = byApp.get(key);
    if (existing) {
      existing.minutes += w.durationS / 60;
      existing.episodes += 1;
    } else {
      byApp.set(key, { appTitle: w.appTitle, category: w.category, minutes: w.durationS / 60, episodes: 1 });
    }
  }
  const distractingApps = [...byApp.values()].sort((a, b) => b.minutes - a.minutes);

  return {
    distractionPct: Math.round(distractionPct * 10) / 10,
    zoneOutEpisodes: zoneOutSegments.length,
    spiralEpisodes: spiralSegments.length,
    distractionWindows,
    distractingApps,
  };
}

export interface CrossSessionDistractionPattern {
  appTitle: string | null;
  category: string | null;
  minutes: number;
  episodes: number;
  avgMinutesPerEpisode: number;
}

interface DistractedBucketRow {
  bucket: Date;
  state: string;
}

interface DistractedEpisode {
  state: string;
  startedAt: Date;
  endedAt: Date;
}

/** Groups consecutive (same-state, back-to-back) 1-minute buckets into episodes -- the
 * same run-length logic as rollups.ts's ribbon builder, scoped to just the two
 * distraction states so this stays a self-contained aggregate query. */
function bucketsToEpisodes(buckets: DistractedBucketRow[]): DistractedEpisode[] {
  const episodes: DistractedEpisode[] = [];
  for (const row of buckets) {
    const bucketEnd = new Date(row.bucket.getTime() + 60_000);
    const last = episodes[episodes.length - 1];
    if (last && last.state === row.state && last.endedAt.getTime() === row.bucket.getTime()) {
      last.endedAt = bucketEnd;
    } else {
      episodes.push({ state: row.state, startedAt: row.bucket, endedAt: bucketEnd });
    }
  }
  return episodes;
}

/**
 * Cross-session counterpart to computeDistractionStats: same underlying signal
 * (samples_1min state buckets correlated with app_context events) but rolled up
 * across every session for a device instead of scoped to one, ranking which
 * apps/categories distraction (zoned_out + spiraling) concentrates in.
 *
 * Naturally returns an empty array -- no fabricated placeholder data -- when a
 * device has no sessions or no distracted minutes yet, matching how
 * computeFocusWindow/computeSettleTrend degrade with too little signal; the
 * caller/UI decides how many sessions are "enough" to draw a pattern from.
 */
export async function computeCrossSessionDistractionPattern(
  pool: Pool,
  deviceId?: string,
): Promise<CrossSessionDistractionPattern[]> {
  const sessionResult = await pool.query<{ id: string }>(
    deviceId ? "SELECT id FROM sessions WHERE device_id = $1" : "SELECT id FROM sessions",
    deviceId ? [deviceId] : [],
  );

  const byKey = new Map<string, Omit<CrossSessionDistractionPattern, "avgMinutesPerEpisode">>();

  for (const session of sessionResult.rows) {
    const buckets = await pool.query<DistractedBucketRow>(
      `SELECT bucket, state FROM samples_1min
       WHERE session_id = $1 AND state = ANY($2::text[])
       ORDER BY bucket ASC`,
      [session.id, [State.ZonedOut, State.Spiraling]],
    );
    if (buckets.rows.length === 0) continue;

    const episodes = bucketsToEpisodes(buckets.rows);
    const contextTimeline = await getAppContextTimeline(pool, session.id);

    for (const episode of episodes) {
      const app = appAt(contextTimeline, episode.startedAt.getTime());
      const key = `${app?.app_title ?? "unknown"}::${app?.category ?? "unknown"}`;
      const minutes = (episode.endedAt.getTime() - episode.startedAt.getTime()) / 60_000;

      const existing = byKey.get(key);
      if (existing) {
        existing.minutes += minutes;
        existing.episodes += 1;
      } else {
        byKey.set(key, {
          appTitle: app?.app_title ?? null,
          category: app?.category ?? null,
          minutes,
          episodes: 1,
        });
      }
    }
  }

  return [...byKey.values()]
    .map((p) => ({
      ...p,
      minutes: Math.round(p.minutes * 10) / 10,
      avgMinutesPerEpisode: Math.round((p.minutes / p.episodes) * 10) / 10,
    }))
    .sort((a, b) => b.avgMinutesPerEpisode - a.avgMinutesPerEpisode);
}

function buildTipsPrompt(
  summary: SessionSummary,
  stats: Pick<SessionInsights, "distractionPct" | "zoneOutEpisodes" | "spiralEpisodes" | "distractingApps">,
): string {
  const appsText = stats.distractingApps
    .slice(0, 3)
    .map((a) => `${a.appTitle ?? a.category ?? "unknown app"} (${Math.round(a.minutes)}min across ${a.episodes} episode(s))`)
    .join(", ");

  return [
    "Based on this real study session data, write 2-3 short, specific, actionable tips",
    "for the person's NEXT study session. Second person, sentence case, no exclamation marks,",
    "no praise, no diagnosis -- observed patterns only. Do not use markdown formatting.",
    `Session length: ${summary.durationS ? Math.round(summary.durationS / 60) : "unknown"} minutes.`,
    `Time zoned out (distracted): ${stats.distractionPct}% of the session, across ${stats.zoneOutEpisodes} episode(s).`,
    `Arousal-climbing (spiral) episodes: ${stats.spiralEpisodes}.`,
    stats.distractingApps.length > 0
      ? `Apps/categories active during distraction: ${appsText}.`
      : "No app data correlated with distraction periods.",
  ].join(" ");
}

export async function generateAndStoreTips(
  pool: Pool,
  sessionId: string,
  summary: SessionSummary,
  stats: Pick<SessionInsights, "distractionPct" | "zoneOutEpisodes" | "spiralEpisodes" | "distractingApps">,
): Promise<string> {
  const prompt = buildTipsPrompt(summary, stats);
  const tips = await generateText(prompt, { fallback: FALLBACK_TIPS });
  await pool.query("UPDATE sessions SET tips = $1 WHERE id = $2", [tips, sessionId]);
  return tips;
}

export async function getStoredTips(pool: Pool, sessionId: string): Promise<string | null> {
  const result = await pool.query<{ tips: string | null }>("SELECT tips FROM sessions WHERE id = $1", [sessionId]);
  return result.rows[0]?.tips ?? null;
}
