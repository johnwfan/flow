import { State } from "@flow/shared";
import type { DistractionWindow, EventRow, StateRibbonSegment, TimelineBucket } from "@/types/api";

/**
 * Presentation-layer derivations over data the API already returns — no
 * backend changes. Per the design README ("one schedule is the source of
 * truth"), every one of these reads the same `stateRibbon` / `timeline` /
 * `probes` the rest of the page renders, so the numbers can't drift apart.
 */

const SETTLE_MIN_STRETCH_S = 180; // 3 minutes counts as "settled", not just a lucky blip

/** Minutes from session start to the first sustained (>=3m) focused stretch. */
export function settleSeconds(ribbon: StateRibbonSegment[]): number | null {
  if (ribbon.length === 0) return null;
  const focused = ribbon.filter((s) => s.state === State.Focused);
  if (focused.length === 0) return null;
  const sustained = focused.find((s) => s.durationS >= SETTLE_MIN_STRETCH_S) ?? focused[0]!;
  const start = new Date(ribbon[0]!.startedAt).getTime();
  const segStart = new Date(sustained.startedAt).getTime();
  return Math.max(0, Math.round((segStart - start) / 1000));
}

/** Longest unbroken stretch in a given state (default: focused/deep work). */
export function longestStretchSeconds(ribbon: StateRibbonSegment[], state: string = State.Focused): number {
  return ribbon.filter((s) => s.state === state).reduce((max, s) => Math.max(max, s.durationS), 0);
}

export function median(values: number[]): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid]! : (sorted[mid - 1]! + sorted[mid]!) / 2;
}

export function deepPct(focusTimeS: number, durationS: number | null): number | null {
  if (!durationS) return null;
  return Math.round((focusTimeS / durationS) * 100);
}

/**
 * Self-report agreement for one session's own check-ins — used as this
 * session's "signal" figure (the API has no per-session confidence field;
 * this is the closest real, already-fetched substitute — see report).
 */
export function sessionAgreement(probes: EventRow[]): { pct: number | null; agreeCount: number; answered: number } {
  let agree = 0;
  let answered = 0;
  for (const probe of probes) {
    const predicted = String(probe.payload["classifier_state"] ?? "");
    const userResponse = probe.payload["user_response"];
    if (!userResponse || typeof userResponse !== "string") continue;
    answered += 1;
    if (userResponse === predicted) agree += 1;
  }
  return { pct: answered === 0 ? null : Math.round((agree / answered) * 100), agreeCount: agree, answered };
}

const ALARM_STATES = new Set<string>([State.ZonedOut, State.Spiraling]);

export function isFalseAlarm(predicted: string, userResponse: string | null): boolean {
  return ALARM_STATES.has(predicted) && userResponse === State.Focused;
}

/** The distraction window (if any) whose span overlaps `ts`, within a tolerance either side. */
export function findOverlappingWindow(
  ts: string,
  windows: DistractionWindow[],
  toleranceS = 90,
): DistractionWindow | undefined {
  const t = new Date(ts).getTime();
  return windows.find((w) => {
    const start = new Date(w.startedAt).getTime() - toleranceS * 1000;
    const end = new Date(w.endedAt).getTime() + toleranceS * 1000;
    return t >= start && t <= end;
  });
}

/** Mean of a physiology field in the windowS seconds immediately before/after a timestamp. */
export function avgAround(
  timeline: TimelineBucket[],
  ts: string,
  field: "avgPulseBpm" | "avgBreathingRpm",
  windowS = 150,
): { before: number | null; after: number | null } {
  const t = new Date(ts).getTime();
  const before: number[] = [];
  const after: number[] = [];
  for (const bucket of timeline) {
    const bt = new Date(bucket.bucket).getTime();
    const v = bucket[field];
    if (v === null) continue;
    if (bt < t && bt >= t - windowS * 1000) before.push(v);
    else if (bt >= t && bt <= t + windowS * 1000) after.push(v);
  }
  const avg = (arr: number[]) => (arr.length ? arr.reduce((s, x) => s + x, 0) / arr.length : null);
  return { before: avg(before), after: avg(after) };
}

export function fmtMeasure(value: number | null): string {
  return value === null ? "—" : String(Math.round(value));
}
