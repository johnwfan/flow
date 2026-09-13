import { Category } from "@flow/shared";
import { generateText } from "../clients/gemini.js";

const CATEGORIES = Object.values(Category);
const cache = new Map<string, Category>();

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

export async function categorizeAppTitles(titles: string[]): Promise<Map<string, Category>> {
  const uncached = [...new Set(titles)].filter((t) => !cache.has(t));

  if (uncached.length > 0) {
    const raw = await generateText(buildPrompt(uncached), { fallback: "", timeoutMs: 8000 });
    const parsed = raw ? parseResponse(raw, uncached) : new Map(uncached.map((t) => [t, Category.Unknown]));
    for (const [title, category] of parsed) cache.set(title, category);
  }

  const result = new Map<string, Category>();
  for (const title of titles) {
    result.set(title, cache.get(title) ?? Category.Unknown);
  }
  return result;
}
