import type { EventRow } from "@/types/api";
import { categoryColor, categoryLabel } from "@/lib/colors";

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
    <div>
      <div className="mb-1.5 text-xs font-medium uppercase tracking-wide text-muted">App category</div>
      <div className="flex h-3 w-full overflow-hidden rounded-full">
        {segments.map((segment, i) => (
          <div
            key={i}
            title={`${categoryLabel(segment.category)} — ${Math.round(segment.durationS / 60)}m`}
            style={{ width: `${(segment.durationS / total) * 100}%`, backgroundColor: categoryColor(segment.category) }}
          />
        ))}
      </div>
    </div>
  );
}
