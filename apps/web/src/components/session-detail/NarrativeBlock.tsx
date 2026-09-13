import type { SessionInsights, StateRibbonSegment } from "@/types/api";
import { longestStretchSeconds, settleSeconds } from "@/lib/sessionMetrics";

/** Splits the stored narrative into a lede (first sentence) and body (the rest). */
function splitNarrative(narrative: string): { lede: string; body: string } {
  const match = narrative.match(/^(.+?[.!?])(\s+(.*))?$/s);
  if (!match) return { lede: narrative, body: "" };
  return { lede: match[1]!, body: (match[3] ?? "").trim() };
}

/**
 * Three computed takeaways, all derived from this session's own ribbon and
 * insights — never a separately-authored field — so they can't drift from
 * what the rest of the page shows (design README "one schedule of truth").
 */
function buildTakeaways(ribbon: StateRibbonSegment[], insights: SessionInsights): string[] {
  const takeaways: string[] = [];

  const longestMin = Math.round(longestStretchSeconds(ribbon) / 60);
  if (longestMin > 0) {
    takeaways.push(`Your longest unbroken stretch was ${longestMin} minute${longestMin === 1 ? "" : "s"}.`);
  }

  const resets = insights.zoneOutEpisodes + insights.spiralEpisodes;
  if (resets > 0) {
    takeaways.push(
      `${resets} moment${resets === 1 ? "" : "s"} pulled you away — about ${Math.round(insights.distractionPct)}% of the session spent drifting.`,
    );
  } else {
    takeaways.push("Nothing pulled you away for long enough to need a reset.");
  }

  const settle = settleSeconds(ribbon);
  takeaways.push(
    settle !== null
      ? `You settled into deep work about ${Math.max(1, Math.round(settle / 60))} minute${Math.round(settle / 60) === 1 ? "" : "s"} in.`
      : "This session never reached a sustained stretch of deep work.",
  );

  return takeaways;
}

export function NarrativeBlock({
  narrative,
  ribbon,
  insights,
}: {
  narrative: string | null;
  ribbon: StateRibbonSegment[];
  insights: SessionInsights;
}) {
  if (!narrative) {
    return (
      <p style={{ fontSize: 15, color: "var(--body)", lineHeight: 1.55, maxWidth: "62ch" }}>
        Too little signal was usable to write this session up — the timeline below is kept, but the account is
        withheld. A story needs evidence.
      </p>
    );
  }

  const { lede, body } = splitNarrative(narrative);
  const takeaways = buildTakeaways(ribbon, insights);

  return (
    <div>
      <div
        style={{
          fontSize: 33,
          fontWeight: 500,
          letterSpacing: "-0.04em",
          lineHeight: 1.2,
          maxWidth: "38ch",
        }}
      >
        {lede}
      </div>
      {body && (
        <p style={{ margin: "var(--s5) 0 0", fontSize: 18, lineHeight: 1.6, color: "var(--body)", maxWidth: "68ch" }}>
          {body}
        </p>
      )}
      <div style={{ marginTop: "var(--s6)" }}>
        {takeaways.map((text, i) => (
          <div
            key={i}
            style={{
              padding: "var(--s4) 0",
              borderTop: i === 0 ? "2px solid var(--deep)" : "1px solid var(--line)",
              fontSize: 15,
              color: "var(--ink)",
              lineHeight: 1.5,
            }}
          >
            {text}
          </div>
        ))}
      </div>
    </div>
  );
}
