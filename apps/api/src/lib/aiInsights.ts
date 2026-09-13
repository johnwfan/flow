import { createHash } from "node:crypto";
import type { Pool } from "pg";
import { generateTextResult } from "../clients/gemini.js";
import type {
  BreakQuality,
  CategoryEffort,
  FocusWindow,
  InterventionEfficacyPoint,
  SessionFocusPoint,
  SettlePoint,
  ValidationResult,
} from "./insights.js";
import { listSessionSummaries, type SessionSummary } from "./rollups.js";
import type { CrossSessionDistractionPattern } from "./sessionInsights.js";

export type InsightEvidenceId =
  | "focus-window"
  | "focus-by-time"
  | "effort-by-app"
  | "refocus-cost"
  | "time-to-settle"
  | "breaks-and-interventions"
  | "validation";

export interface AiInsightSection {
  id: InsightEvidenceId;
  title: string;
  body: string;
  evidence: string[];
  recommendation: string;
  confidence: "low" | "medium" | "high";
}

export interface AiInsightReport {
  generatedAt: string;
  source: "gemini" | "fallback";
  sessionCount: number;
  summary: string;
  sections: AiInsightSection[];
}

export interface ComputedInsights {
  focusWindow: FocusWindow;
  focusByTime: SessionFocusPoint[];
  effortByCategory: CategoryEffort[];
  settleTrend: SettlePoint[];
  breakQuality: BreakQuality;
  interventionEfficacy: InterventionEfficacyPoint[];
  validation: ValidationResult;
  distractionPatterns: CrossSessionDistractionPattern[];
}

const PROMPT_VERSION = "cross-session-insights-v1";
const ALL_DEVICES_SCOPE = "__all__";
const ALLOWED_IDS: InsightEvidenceId[] = [
  "focus-window",
  "focus-by-time",
  "effort-by-app",
  "refocus-cost",
  "time-to-settle",
  "breaks-and-interventions",
  "validation",
];

let insightReportsTableReady = false;

function scopeKey(deviceId?: string): string {
  return deviceId?.trim() || ALL_DEVICES_SCOPE;
}

async function ensureInsightReportsTable(pool: Pool): Promise<void> {
  if (insightReportsTableReady) return;

  await pool.query(`
    CREATE TABLE IF NOT EXISTS insight_reports (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      scope_key TEXT NOT NULL,
      device_id TEXT,
      generated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      prompt_version TEXT NOT NULL,
      data_fingerprint TEXT NOT NULL,
      session_count INTEGER NOT NULL,
      source TEXT NOT NULL,
      content JSONB NOT NULL
    )
  `);
  await pool.query(`
    CREATE INDEX IF NOT EXISTS idx_insight_reports_scope_generated
    ON insight_reports (scope_key, generated_at DESC)
  `);
  insightReportsTableReady = true;
}

function sessionCount(insights: ComputedInsights): number {
  return insights.settleTrend.length;
}

function round(value: number, places = 1): number {
  const factor = 10 ** places;
  return Math.round(value * factor) / factor;
}

function avg(values: number[]): number | null {
  if (values.length === 0) return null;
  return round(values.reduce((sum, value) => sum + value, 0) / values.length);
}

function insightFingerprint(insights: ComputedInsights): string {
  const latestSession = insights.settleTrend.reduce<string | null>(
    (latest, point) => (latest === null || point.date > latest ? point.date : latest),
    null,
  );
  const trackedMinutes = insights.effortByCategory.reduce((sum, item) => sum + item.minutes, 0);

  return createHash("sha256")
    .update(
      JSON.stringify({
        promptVersion: PROMPT_VERSION,
        sessionCount: sessionCount(insights),
        latestSession,
        trackedMinutes: round(trackedMinutes),
        focusWindow: insights.focusWindow.medianMinutes,
        topEffort: insights.effortByCategory.slice(0, 6),
        topDistractions: insights.distractionPatterns.slice(0, 6),
        settledSessions: insights.settleTrend.filter((point) => point.settleSeconds !== null).length,
        validationN: insights.validation.n,
        agreementRate: round(insights.validation.agreementRate, 3),
        falseAlarmRate: round(insights.validation.falseAlarmRate, 3),
        breakQuality: insights.breakQuality,
        interventions: insights.interventionEfficacy.length,
      }),
    )
    .digest("hex");
}

function compactSession(summary: SessionSummary): object {
  const states = new Map<string, number>();
  for (const segment of summary.stateRibbon) {
    states.set(segment.state, round((states.get(segment.state) ?? 0) + segment.durationS / 60));
  }

  return {
    id: summary.id,
    startedAt: summary.startedAt,
    durationMinutes: summary.durationS === null ? null : round(summary.durationS / 60),
    focusMinutes: round(summary.focusTimeS / 60),
    stateMinutes: [...states.entries()].map(([state, minutes]) => ({ state, minutes })),
    narrative: summary.narrative?.slice(0, 360) ?? null,
  };
}

function buildEvidencePacket(insights: ComputedInsights, recentSessions: SessionSummary[]): object {
  const focusedPct = insights.focusByTime.map((point) => point.pctFocused);
  const settleMinutes = insights.settleTrend
    .filter((point) => point.settleSeconds !== null)
    .map((point) => round(point.settleSeconds! / 60));
  const breathingDeltas = insights.interventionEfficacy.flatMap((point) =>
    point.breathingRpmBefore !== null && point.breathingRpmAfter !== null
      ? [round(point.breathingRpmAfter - point.breathingRpmBefore)]
      : [],
  );

  return {
    sessionCount: sessionCount(insights),
    generatedAt: new Date().toISOString(),
    aggregates: {
      focusWindowMedianMinutes: insights.focusWindow.medianMinutes,
      focusWindowCurve: insights.focusWindow.decayCurve.slice(0, 16),
      focusPercentAverage: avg(focusedPct),
      focusBySessionStartTime: insights.focusByTime.slice(-30),
      topEffortCategories: insights.effortByCategory.slice(0, 10),
      topDistractionsByRefocusCost: insights.distractionPatterns.slice(0, 10),
      settleMinutesAverage: avg(settleMinutes),
      settleTrend: insights.settleTrend.slice(-20),
      breakQuality: insights.breakQuality,
      interventionCount: insights.interventionEfficacy.length,
      interventionBreathingDeltaAverage: avg(breathingDeltas),
      validation: insights.validation,
    },
    recentSessions: recentSessions.slice(0, 12).map(compactSession),
  };
}

function buildPrompt(packet: object): string {
  return [
    "You are writing the cross-session insight board for Flow, a study-focus app.",
    "Use only the supplied aggregate session data. Do not invent sessions, diagnoses, medical claims, or precision the data does not support.",
    "Write in second person, concrete and calm. Prefer observed patterns and next-session choices.",
    "Return ONLY valid JSON with this shape:",
    '{"summary":"2-3 sentence overview","sections":[{"id":"focus-window","title":"Short label","body":"2-3 sentences","evidence":["specific number from data","specific number from data"],"recommendation":"one practical next step","confidence":"low"}]}',
    `Allowed section ids: ${ALLOWED_IDS.join(", ")}. Use 4 to 6 sections and choose the strongest evidence.`,
    "Confidence must be low, medium, or high based on session count, validation n, and missing data.",
    `Data: ${JSON.stringify(packet)}`,
  ].join("\n");
}

function text(value: unknown, fallback: string, maxLength: number): string {
  const raw = typeof value === "string" && value.trim() ? value.trim() : fallback;
  return raw.length > maxLength ? `${raw.slice(0, maxLength - 1)}...` : raw;
}

function confidence(value: unknown): "low" | "medium" | "high" {
  return value === "high" || value === "medium" || value === "low" ? value : "low";
}

function evidenceId(value: unknown, fallback: InsightEvidenceId): InsightEvidenceId {
  return typeof value === "string" && ALLOWED_IDS.includes(value as InsightEvidenceId)
    ? (value as InsightEvidenceId)
    : fallback;
}

function parseReport(raw: string, fallback: AiInsightReport): AiInsightReport | null {
  try {
    const withoutFence = raw.replace(/^```(?:json)?/i, "").replace(/```$/i, "").trim();
    const match = withoutFence.match(/\{[\s\S]*\}/);
    if (!match) return null;
    const parsed = JSON.parse(match[0]) as { summary?: unknown; sections?: unknown };
    if (!Array.isArray(parsed.sections)) return null;

    const sections = parsed.sections.slice(0, 6).map((section: any, index) => ({
      id: evidenceId(section?.id, fallback.sections[index % fallback.sections.length]!.id),
      title: text(section?.title, fallback.sections[index % fallback.sections.length]!.title, 80),
      body: text(section?.body, fallback.sections[index % fallback.sections.length]!.body, 520),
      evidence: Array.isArray(section?.evidence)
        ? section.evidence.slice(0, 3).map((item: unknown) => text(item, "", 150)).filter(Boolean)
        : fallback.sections[index % fallback.sections.length]!.evidence,
      recommendation: text(
        section?.recommendation,
        fallback.sections[index % fallback.sections.length]!.recommendation,
        220,
      ),
      confidence: confidence(section?.confidence),
    }));

    if (sections.length === 0) return null;
    return {
      ...fallback,
      summary: text(parsed.summary, fallback.summary, 680),
      sections,
    };
  } catch {
    return null;
  }
}

function fallbackReport(insights: ComputedInsights): AiInsightReport {
  const count = sessionCount(insights);
  const trackedMinutes = Math.round(insights.effortByCategory.reduce((sum, item) => sum + item.minutes, 0));
  const topEffort = insights.effortByCategory[0];
  const topDistraction = insights.distractionPatterns[0];
  const settled = insights.settleTrend.filter((point) => point.settleSeconds !== null);

  return {
    generatedAt: new Date().toISOString(),
    source: "fallback",
    sessionCount: count,
    summary:
      count === 0
        ? "Run a few sessions and Flow will have enough evidence to write a cross-session read."
        : `Across ${count} completed sessions and about ${trackedMinutes} tracked minutes, Flow has enough aggregate signal to summarize recurring focus patterns.`,
    sections: [
      {
        id: "focus-window",
        title: "Focus window",
        body:
          insights.focusWindow.medianMinutes === null
            ? "There is not enough clear drop-off data yet to estimate a reliable focus window."
            : `Your median first drop-off arrives around minute ${insights.focusWindow.medianMinutes}.`,
        evidence:
          insights.focusWindow.medianMinutes === null
            ? [`${count} completed session(s)`]
            : [`Median first drop-off: ${insights.focusWindow.medianMinutes} minute(s)`],
        recommendation: "Plan blocks around the point where focus usually starts to fade.",
        confidence: count >= 5 ? "medium" : "low",
      },
      {
        id: "effort-by-app",
        title: "Where effort goes",
        body: topEffort
          ? `${topEffort.category} carries the largest share of tracked effort so far.`
          : "There is not enough categorized app time yet to rank effort.",
        evidence: topEffort ? [`${Math.round(topEffort.minutes)} minute(s) in ${topEffort.category}`] : [],
        recommendation: "Start the next session already inside the app/category you want to protect.",
        confidence: count >= 3 ? "medium" : "low",
      },
      {
        id: "refocus-cost",
        title: "Refocus cost",
        body: topDistraction
          ? `${topDistraction.appTitle ?? topDistraction.category ?? "Unknown"} has the highest average re-focus cost in the current data.`
          : "There is not enough distracted time yet to identify a re-focus cost pattern.",
        evidence: topDistraction
          ? [`${topDistraction.avgMinutesPerEpisode} minute(s) per episode across ${topDistraction.episodes} episode(s)`]
          : [],
        recommendation: "Remove or pre-decide that app before starting a high-stakes work block.",
        confidence: count >= 3 ? "medium" : "low",
      },
      {
        id: "time-to-settle",
        title: "Time to settle",
        body:
          settled.length === 0
            ? "No completed sessions have a clear first focused stretch yet."
            : `${settled.length} session(s) reached a measurable focused stretch.`,
        evidence: settled.length > 0 ? [`${settled.length} settled session(s)`] : [],
        recommendation: "Treat the first few minutes as setup time and reduce context switches before pressing start.",
        confidence: settled.length >= 5 ? "medium" : "low",
      },
    ],
  };
}

function rowToReport(row: {
  generated_at: Date;
  session_count: number;
  source: string;
  content: any;
}): AiInsightReport {
  const content = row.content ?? {};
  return {
    generatedAt: row.generated_at.toISOString(),
    source: row.source === "gemini" ? "gemini" : "fallback",
    sessionCount: row.session_count,
    summary: text(content.summary, "", 680),
    sections: Array.isArray(content.sections) ? content.sections : [],
  };
}

async function latestStoredReport(
  pool: Pool,
  deviceId: string | undefined,
): Promise<(AiInsightReport & { dataFingerprint: string; promptVersion: string }) | null> {
  await ensureInsightReportsTable(pool);
  const result = await pool.query<{
    generated_at: Date;
    session_count: number;
    source: string;
    prompt_version: string;
    data_fingerprint: string;
    content: any;
  }>(
    `SELECT generated_at, session_count, source, prompt_version, data_fingerprint, content
     FROM insight_reports
     WHERE scope_key = $1
     ORDER BY generated_at DESC
     LIMIT 1`,
    [scopeKey(deviceId)],
  );
  const row = result.rows[0];
  return row ? { ...rowToReport(row), dataFingerprint: row.data_fingerprint, promptVersion: row.prompt_version } : null;
}

export async function getOrCreateAiInsightReport(
  pool: Pool,
  deviceId: string | undefined,
  insights: ComputedInsights,
): Promise<AiInsightReport | null> {
  if (sessionCount(insights) === 0) return null;

  const fingerprint = insightFingerprint(insights);
  const latest = await latestStoredReport(pool, deviceId);
  if (latest?.promptVersion === PROMPT_VERSION && latest.dataFingerprint === fingerprint) {
    return latest;
  }

  return generateAndStoreAiInsightReport(pool, deviceId, insights);
}

export async function generateAndStoreAiInsightReport(
  pool: Pool,
  deviceId: string | undefined,
  insights: ComputedInsights,
): Promise<AiInsightReport | null> {
  if (sessionCount(insights) === 0) return null;

  await ensureInsightReportsTable(pool);
  const recentSessions = (await listSessionSummaries(pool, deviceId)).slice(0, 12);
  const fallback = fallbackReport(insights);
  const packet = buildEvidencePacket(insights, recentSessions);
  const generated = await generateTextResult(buildPrompt(packet), {
    fallback: JSON.stringify({ summary: fallback.summary, sections: fallback.sections }),
    timeoutMs: 45_000,
  });

  const parsed = generated.source === "gemini" ? parseReport(generated.text, fallback) : null;
  const report: AiInsightReport = parsed
    ? { ...parsed, source: "gemini" }
    : { ...fallback, source: "fallback" };

  const result = await pool.query<{
    generated_at: Date;
    session_count: number;
    source: string;
    content: any;
  }>(
    `INSERT INTO insight_reports
       (scope_key, device_id, prompt_version, data_fingerprint, session_count, source, content)
     VALUES ($1, $2, $3, $4, $5, $6, $7::jsonb)
     RETURNING generated_at, session_count, source, content`,
    [
      scopeKey(deviceId),
      deviceId ?? null,
      PROMPT_VERSION,
      insightFingerprint(insights),
      sessionCount(insights),
      report.source,
      JSON.stringify({ summary: report.summary, sections: report.sections }),
    ],
  );

  return rowToReport(result.rows[0]!);
}
