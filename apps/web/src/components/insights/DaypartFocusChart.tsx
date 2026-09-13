import type { SessionFocusPoint } from "@/types/api";
import { NotEnoughData } from "@/components/ui/NotEnoughData";
import { MIN_SESSIONS_FOR_PATTERN } from "@/lib/patterns";
import { BarsList } from "./BarsList";
import { WrittenForYou } from "./WrittenForYou";

const PLACEHOLDER_HEIGHT = 180;

// Bucketed client-side from each session's browser-local start hour -- the
// API server's own clock/timezone isn't necessarily the user's.
const DAYPARTS = [
  { key: "morning", label: "Morning", startH: 5, endH: 11 },
  { key: "afternoon", label: "Afternoon", startH: 11, endH: 17 },
  { key: "evening", label: "Evening", startH: 17, endH: 21 },
  { key: "night", label: "Night", startH: 21, endH: 5 },
] as const;

function daypartFor(hour: number): (typeof DAYPARTS)[number] {
  return (
    DAYPARTS.find((d) => (d.startH < d.endH ? hour >= d.startH && hour < d.endH : hour >= d.startH || hour < d.endH)) ??
    DAYPARTS[3]
  );
}

interface DaypartStat {
  key: string;
  label: string;
  avgPct: number;
  sessions: number;
}

function groupByDaypart(data: SessionFocusPoint[]): DaypartStat[] {
  const buckets = new Map<string, { label: string; total: number; count: number }>();
  for (const point of data) {
    const hour = new Date(point.startedAt).getHours();
    const d = daypartFor(hour);
    const existing = buckets.get(d.key) ?? { label: d.label, total: 0, count: 0 };
    existing.total += point.pctFocused;
    existing.count += 1;
    buckets.set(d.key, existing);
  }
  return DAYPARTS.filter((d) => buckets.has(d.key)).map((d) => {
    const b = buckets.get(d.key)!;
    return { key: d.key, label: d.label, avgPct: Math.round(b.total / b.count), sessions: b.count };
  });
}

function daypartNote(stats: DaypartStat[]): string {
  if (stats.length === 0) return "Not enough sessions yet to say when focus is strongest.";
  if (stats.length < 2) {
    const only = stats[0]!;
    return `Most sessions happen in the ${only.label.toLowerCase()} so far -- not enough spread across the day yet to compare.`;
  }
  const best = stats.reduce((a, b) => (b.avgPct > a.avgPct ? b : a));
  const worst = stats.reduce((a, b) => (b.avgPct < a.avgPct ? b : a));
  if (best.key === worst.key) return `Focus has stayed roughly even across the day, around ${best.avgPct}%.`;
  return `Your focus is highest in the ${best.label.toLowerCase()} (${best.avgPct}%) and lowest in the ${worst.label.toLowerCase()} (${worst.avgPct}%) -- worth scheduling your hardest work in the ${best.label.toLowerCase()}.`;
}

export function DaypartFocusChart({ data, sessionCount }: { data: SessionFocusPoint[]; sessionCount: number }) {
  const hasEnough = sessionCount >= MIN_SESSIONS_FOR_PATTERN && data.length > 0;
  const stats = hasEnough ? groupByDaypart(data) : [];

  return (
    <div>
      {stats.length > 0 ? (
        <BarsList
          items={stats.map((s) => ({
            label: `${s.label} (${s.sessions})`,
            value: `${s.avgPct}%`,
            pct: s.avgPct,
            colorVar: "--deep-mid",
          }))}
        />
      ) : (
        <NotEnoughData height={PLACEHOLDER_HEIGHT} have={sessionCount} need={MIN_SESSIONS_FOR_PATTERN} />
      )}
      <WrittenForYou text={daypartNote(stats)} />
    </div>
  );
}
