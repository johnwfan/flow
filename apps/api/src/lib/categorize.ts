import { Category } from "@flow/shared";
import { generateText } from "../clients/gemini.js";

const CATEGORIES = Object.values(Category);
const cache = new Map<string, Category>();
// Titles a background classification is already running for -- avoids
// firing duplicate Gemini calls when several requests see the same new
// app title before the first classification finishes.
const inFlight = new Set<string>();

function buildPrompt(titles: string[]): string {
  return [
    `Classify each app/window title into exactly one of these categories: ${CATEGORIES.join(", ")}.`,
    "Examples: \"Visual Studio Code\" -> study, \"Instagram\" -> social, \"YouTube\" -> entertainment,",
    "\"Google Sheets\" -> productivity, \"Slack\" -> communication, \"System Preferences\" -> system.",
    `Titles: ${JSON.stringify(titles)}`,
    'Respond with ONLY a JSON array of objects like [{"title": "...", "category": "..."}], no other text.',
  ].join(" ");
}

function parseResponse(raw: string, titles: string[]): Map<string, Category> {
  const result = new Map<string, Category>();
  try {
    const match = raw.match(/\[[\s\S]*\]/);
    if (!match) throw new Error("no JSON array found");
    const parsed = JSON.parse(match[0]) as { title: string; category: string }[];
    for (const entry of parsed) {
      const category = CATEGORIES.includes(entry.category as Category) ? (entry.category as Category) : Category.Unknown;
      result.set(entry.title, category);
    }
  } catch {
    // fall through — unset titles default to Unknown below
  }
  for (const title of titles) {
    if (!result.has(title)) result.set(title, Category.Unknown);
  }
  return result;
}

/**
 * Returns whatever's already classified immediately -- anything new is
 * classified in the BACKGROUND (not awaited) and cached for next time.
 *
 * This used to await a live Gemini call for any not-yet-seen app title,
 * right in the middle of loading /v1/insights. gemini.ts's own client
 * measured this exact prompt's real median latency at 7.5-8.8s, yet this
 * call site hardcoded an 8000ms timeout -- shorter than the median, so
 * roughly half of calls aborted right at the boundary while still burning
 * the full 8s, and the rest still legitimately took ~8s to succeed. An
 * "Unknown" app title turning into its real category one page load later
 * is a fine trade for the Insights page never blocking on a live LLM call
 * again.
 */
export async function categorizeAppTitles(titles: string[]): Promise<Map<string, Category>> {
  const uncached = [...new Set(titles)].filter((t) => !cache.has(t) && !inFlight.has(t));

  if (uncached.length > 0) {
    for (const t of uncached) inFlight.add(t);
    void classifyInBackground(uncached);
  }

  const result = new Map<string, Category>();
  for (const title of titles) {
    result.set(title, cache.get(title) ?? Category.Unknown);
  }
  return result;
}

async function classifyInBackground(titles: string[]): Promise<void> {
  try {
    const raw = await generateText(buildPrompt(titles), { fallback: "" });
    const parsed = raw ? parseResponse(raw, titles) : new Map(titles.map((t) => [t, Category.Unknown]));
    for (const [title, category] of parsed) cache.set(title, category);
  } catch (err: any) {
    console.warn(`[categorize] background classification failed: ${err.message}`);
  } finally {
    for (const t of titles) inFlight.delete(t);
  }
}
