import type { Insights } from "@/types/api";

/**
 * Minimum distinct sessions before a cross-session pattern (focus window,
 * effort by app, time to settle, cross-session distraction) is considered
 * trustworthy enough to draw. Below this, the chart shows the design
 * system's "not enough data" hatch instead of a trend it can't support --
 * see the design README, "Not-enough-data state".
 */
export const MIN_SESSIONS_FOR_PATTERN = 3;

/** Minimum answered thought-probes before the validation matrix draws real
 * cells instead of the not-enough-data state. */
export const MIN_PROBES_FOR_VALIDATION = 5;

/** Every Insights sub-computation returns one settleTrend point per session
 * for the device (see computeSettleTrend), regardless of whether that
 * session settled -- so its length is the real total session count. */
export function sessionCount(insights: Insights): number {
  return insights.settleTrend.length;
}
