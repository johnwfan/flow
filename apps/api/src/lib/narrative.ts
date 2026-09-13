import type { Pool } from "pg";
import { generateText } from "../clients/gemini.js";
import type { SessionSummary } from "./rollups.js";

const FALLBACK_NARRATIVE = "Session complete. Check the timeline below for a detailed breakdown of your focus states.";

async function getCategoryBreakdown(pool: Pool, sessionId: string): Promise<{ category: string | null; count: number }[]> {
  const result = await pool.query<{ category: string | null; count: string }>(
    `SELECT payload->>'category' AS category, count(*) AS count
     FROM events
     WHERE session_id = $1 AND kind = 'app_context'
     GROUP BY payload->>'category'
     ORDER BY count DESC`,
    [sessionId],
  );
  return result.rows.map((r) => ({ category: r.category, count: Number(r.count) }));
}

function buildPrompt(summary: SessionSummary, categories: { category: string | null; count: number }[]): string {
  const ribbonText = summary.stateRibbon
    .map((s) => `${s.state} for ${Math.round(s.durationS / 60)}min`)
    .join(", ");
  const categoryText = categories
    .map((c) => `${c.category ?? "unknown"} (${c.count} switches)`)
    .join(", ");

  return [
    "Write a short (2-3 sentence), encouraging narrative summary of a focus-tracking session.",
    `Total duration: ${summary.durationS ? Math.round(summary.durationS / 60) : "unknown"} minutes.`,
    `Focus time: ${Math.round(summary.focusTimeS / 60)} minutes.`,
    `State timeline: ${ribbonText || "no data"}.`,
    `App categories visited: ${categoryText || "none recorded"}.`,
    "Be specific about what went well and one thing to try next time. Do not use markdown formatting.",
  ].join(" ");
}

export async function generateAndStoreNarrative(pool: Pool, sessionId: string, summary: SessionSummary): Promise<string> {
  const categories = await getCategoryBreakdown(pool, sessionId);
  const prompt = buildPrompt(summary, categories);
  const narrative = await generateText(prompt, { fallback: FALLBACK_NARRATIVE, timeoutMs: 8000 });

  await pool.query("UPDATE sessions SET narrative = $1 WHERE id = $2", [narrative, sessionId]);
  return narrative;
}
