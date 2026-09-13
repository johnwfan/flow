import type {
  CategoryEffort,
  DistractionPattern,
  FocusWindow,
  Insights,
  SessionFocusPoint,
  SettlePoint,
} from "@/types/api";
import { categoryLabel } from "@/lib/colors";
import { MIN_SESSIONS_FOR_PATTERN } from "@/lib/patterns";

export interface InsightTakeaway {
  id: "focus-window" | "focus-by-time" | "effort-by-app" | "refocus-cost" | "time-to-settle";
  label: string;
  text: string;
}

export interface DaypartStat {
  key: string;
  label: string;
  avgPct: number;
  sessions: number;
}

export interface SettledPoint {
  sessionId: string;
  date: string;
  settleSeconds: number;
}

const DAYPARTS = [
  { key: "morning", label: "Morning", startH: 5, endH: 11 },
  { key: "afternoon", label: "Afternoon", startH: 11, endH: 17 },
  { key: "evening", label: "Evening", startH: 17, endH: 21 },
  { key: "night", label: "Night", startH: 21, endH: 5 },
] as const;

function daypartFor(hour: number): (typeof DAYPARTS)[number] {
  return (
    DAYPARTS.find((daypart) =>
      daypart.startH < daypart.endH
        ? hour >= daypart.startH && hour < daypart.endH
        : hour >= daypart.startH || hour < daypart.endH,
    ) ?? DAYPARTS[3]
  );
}

export function groupByDaypart(data: SessionFocusPoint[]): DaypartStat[] {
  const buckets = new Map<string, { label: string; total: number; count: number }>();
  for (const point of data) {
    const daypart = daypartFor(new Date(point.startedAt).getHours());
    const existing = buckets.get(daypart.key) ?? { label: daypart.label, total: 0, count: 0 };
    existing.total += point.pctFocused;
    existing.count += 1;
    buckets.set(daypart.key, existing);
  }

  return DAYPARTS.filter((daypart) => buckets.has(daypart.key)).map((daypart) => {
    const bucket = buckets.get(daypart.key)!;
    return {
      key: daypart.key,
      label: bucket.label,
      avgPct: Math.round(bucket.total / bucket.count),
      sessions: bucket.count,
    };
  });
}

export function settledPoints(data: SettlePoint[]): SettledPoint[] {
  return data.filter((point): point is SettledPoint => point.settleSeconds !== null);
}

function focusWindowNote(data: FocusWindow, sessions: number): string {
  const hasEnough =
    sessions >= MIN_SESSIONS_FOR_PATTERN && data.decayCurve.length > 0 && data.medianMinutes !== null;
  if (!hasEnough || data.medianMinutes === null) {
    return `Not enough sessions with a clear drop-off yet -- ${sessions} of ${MIN_SESSIONS_FOR_PATTERN} needed before this trend means anything.`;
  }

  const minutes = data.medianMinutes;
  const pointsAfterMedian = data.decayCurve.filter((point) => point.minute > minutes);
  const worst = pointsAfterMedian.reduce<(typeof pointsAfterMedian)[number] | null>(
    (minimum, point) =>
      minimum === null || point.pctStillFocused < minimum.pctStillFocused ? point : minimum,
    null,
  );
  const tailNote = worst
    ? ` By minute ${worst.minute}, focus has dropped to ${worst.pctStillFocused}%.`
    : "";
  return `Your attention holds about ${minutes} minute${minutes === 1 ? "" : "s"} before the first real drop, based on ${sessions} session${sessions === 1 ? "" : "s"}.${tailNote} Consider ending a block a little before that point rather than pushing past it.`;
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

function effortNote(data: CategoryEffort[], sessionCount: number): string {
  const top = data[0];
  if (!top) return "Not enough categorized app time yet to say where your effort goes.";
  const total = data.reduce((sum, item) => sum + item.minutes, 0);
  const share = total > 0 ? Math.round((top.minutes / total) * 100) : 0;
  const minutes = Math.round(top.minutes);
  return `${categoryLabel(top.category)} carries the most of your tracked effort -- ${minutes} minute${minutes === 1 ? "" : "s"} (${share}%) across ${sessionCount} session${sessionCount === 1 ? "" : "s"}.`;
}

function distractionLabel(pattern: DistractionPattern): string {
  if (pattern.appTitle) {
    return pattern.appTitle.length > 42 ? `${pattern.appTitle.slice(0, 39)}…` : pattern.appTitle;
  }
  if (pattern.category) return categoryLabel(pattern.category);
  return "Unknown";
}

function distractionNote(data: DistractionPattern[], sessionCount: number): string {
  const top = data[0];
  if (!top) return "Not enough distracted time recorded yet to say what costs the most per check.";
  const averageMinutes = top.avgMinutesPerEpisode;
  const totalMinutes = Math.round(top.minutes);
  return `${distractionLabel(top)} costs you the most per check -- averaging ${averageMinutes} minute${averageMinutes === 1 ? "" : "s"} before you're back to deep work, across ${top.episodes} check-in${top.episodes === 1 ? "" : "s"}. ${totalMinutes} minute${totalMinutes === 1 ? "" : "s"} lost in total across ${sessionCount} session${sessionCount === 1 ? "" : "s"}.`;
}

function settleNote(points: SettledPoint[], sessionCount: number): string {
  const hasEnough = points.length >= 2 && sessionCount >= MIN_SESSIONS_FOR_PATTERN;
  if (!hasEnough) {
    return `Not enough settled sessions yet to show a trend -- ${sessionCount} of ${MIN_SESSIONS_FOR_PATTERN} needed.`;
  }

  const first = points[0]!.settleSeconds;
  const last = points[points.length - 1]!.settleSeconds;
  if (last < first * 0.85) {
    return "You are settling meaningfully faster than you used to. Whatever changed about how you start, it is working.";
  }
  if (last > first * 1.15) {
    return "Settling has been slower lately -- recent sessions are starting with more warm-up time than before.";
  }
  return "Time to settle has stayed roughly steady across your recent sessions.";
}

export function buildInsightTakeaways(insights: Insights, sessions: number): InsightTakeaway[] {
  const daypartStats =
    sessions >= MIN_SESSIONS_FOR_PATTERN && insights.focusByTime.length > 0
      ? groupByDaypart(insights.focusByTime)
      : [];
  const settled = settledPoints(insights.settleTrend);

  return [
    { id: "focus-window", label: "Focus window", text: focusWindowNote(insights.focusWindow, sessions) },
    { id: "focus-by-time", label: "Focus by time", text: daypartNote(daypartStats) },
    { id: "effort-by-app", label: "Effort by app", text: effortNote(insights.effortByCategory, sessions) },
    {
      id: "refocus-cost",
      label: "Re-focus cost",
      text: distractionNote(insights.distractionPatterns, sessions),
    },
    { id: "time-to-settle", label: "Time to settle", text: settleNote(settled, sessions) },
  ];
}

export function distractionPatternLabel(pattern: DistractionPattern): string {
  return distractionLabel(pattern);
}
