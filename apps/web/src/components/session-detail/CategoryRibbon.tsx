import type { EventRow } from "@/types/api";
import { categoryLabel } from "@/lib/colors";
import { categoryVar } from "@/lib/stateVisuals";

interface Segment {
  category: string;
  durationS: number;
}

function buildSegments(contexts: EventRow[], startedAt: string, endedAt: string | null): Segment[] {
  const end = endedAt ? new Date(endedAt).getTime() : Date.now();
  const points = contexts.map((c) => ({
    ts: new Date(c.ts).getTime(),
    category: String(c.payload["category"] ?? "unknown"),
  }));

  const segments: Segment[] = [];
  for (let i = 0; i < points.length; i++) {
    const next = points[i + 1]?.ts ?? end;
    const durationS = Math.max(0, (next - points[i]!.ts) / 1000);
    segments.push({ category: points[i]!.category, durationS });
  }
  return segments;
}

/**
 * The 6px app-category ribbon beneath the state ribbon and HR trace.
 * Categories are always indigo tints — flat, no texture — so they can
 * never be confused with a state colour (design README "Charts").
 */
export function CategoryRibbon({
  contexts,
  startedAt,
  endedAt,
}: {
  contexts: EventRow[];
  startedAt: string;
  endedAt: string | null;
}) {
  if (contexts.length === 0) return null;

  const segments = buildSegments(contexts, startedAt, endedAt);
  const total = segments.reduce((sum, s) => sum + s.durationS, 0);
  if (total === 0) return null;

  return (
    <div
      style={{ display: "flex", gap: 3, height: 6, borderRadius: "var(--r-pill)", overflow: "hidden" }}
      role="img"
      aria-label={`App category over time: ${segments.map((s) => categoryLabel(s.category)).join(", ")}`}
    >
      {segments.map((segment, i) => (
        <span
          key={i}
          style={{
            flex: Math.max(segment.durationS, 1),
            background: categoryVar(segment.category),
          }}
        />
      ))}
    </div>
  );
}
