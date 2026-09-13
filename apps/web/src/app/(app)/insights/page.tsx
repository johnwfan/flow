import { getInsights } from "@/lib/api";
import { Section } from "@/components/marketing/Section";
import { FocusWindowChart } from "@/components/insights/FocusWindowChart";
import { DaypartFocusChart } from "@/components/insights/DaypartFocusChart";
import { CategoryEffortChart } from "@/components/insights/CategoryEffortChart";
import { DistractionPatternChart } from "@/components/insights/DistractionPatternChart";
import { SettleTrendChart } from "@/components/insights/SettleTrendChart";
import { BreaksAndInterventions } from "@/components/insights/BreaksAndInterventions";
import { formatDuration } from "@/lib/format";
import { sessionCount } from "@/lib/patterns";

const QUICK_NAV = [
  { id: "focus-window", label: "Focus window" },
  { id: "focus-by-time", label: "Focus by time of day" },
  { id: "effort-by-app", label: "Effort by app" },
  { id: "refocus-cost", label: "Re-focus cost" },
  { id: "settle", label: "Time to settle" },
  { id: "breaks", label: "Breaks & interventions" },
];

export default async function InsightsPage() {
  const insights = await getInsights();
  const sessions = sessionCount(insights);
  const trackedMinutes = insights.effortByCategory.reduce((sum, c) => sum + c.minutes, 0);

  return (
    <div style={{ maxWidth: 1180, margin: "0 auto", paddingTop: "var(--s5)" }}>
      <div style={{ fontFamily: "var(--mono)", fontSize: 10.5, color: "var(--mute)", marginBottom: 10 }}>
        across {sessions} session{sessions === 1 ? "" : "s"}
        {trackedMinutes > 0 ? ` · ${formatDuration(trackedMinutes * 60)} tracked` : ""}
      </div>
      <h1 style={{ margin: 0, fontSize: 36, fontWeight: 500, letterSpacing: "-0.045em" }}>Patterns</h1>
      <p style={{ margin: "var(--s3) 0 0", fontSize: 18, lineHeight: 1.55, color: "var(--body)", maxWidth: "58ch" }}>
        What holds across sessions, not what happened in one. Nothing here is drawn until there&apos;s enough signal
        behind it.
      </p>

      <nav
        aria-label="Jump to section"
        style={{
          marginTop: "var(--s5)",
          display: "flex",
          flexWrap: "wrap",
          columnGap: "var(--s5)",
          rowGap: "var(--s2)",
        }}
      >
        {QUICK_NAV.map((s) => (
          <a key={s.id} href={`#${s.id}`} style={{ fontFamily: "var(--mono)", fontSize: 10.5 }}>
            {s.label}
          </a>
        ))}
      </nav>

      <Section id="focus-window" title="Focus window" description="How long deep work survives before the first drift.">
        <FocusWindowChart data={insights.focusWindow} sessionCount={sessions} />
      </Section>

      <Section
        id="focus-by-time"
        title="Focus by time of day"
        description="When focus tends to hold up, and when it doesn't."
      >
        <DaypartFocusChart data={insights.focusByTime} sessionCount={sessions} />
      </Section>

      <Section id="effort-by-app" title="Effort by app" description="Where the deep-work minutes actually went.">
        <CategoryEffortChart data={insights.effortByCategory} sessionCount={sessions} />
      </Section>

      <Section
        id="refocus-cost"
        title="Re-focus cost by app"
        description="Ranked by how long it takes to get back to deep work after opening each one -- not total time lost, but the price of a single check."
      >
        <DistractionPatternChart data={insights.distractionPatterns} sessionCount={sessions} />
      </Section>

      <Section id="settle" title="Time to settle" description="Minutes from session start to the first stable deep-work stretch.">
        <SettleTrendChart data={insights.settleTrend} sessionCount={sessions} />
      </Section>

      <Section
        id="breaks"
        title="Breaks & interventions"
        description="Which breaks restored you, and whether the breathing loop moved anything."
      >
        <BreaksAndInterventions breakQuality={insights.breakQuality} interventionEfficacy={insights.interventionEfficacy} />
      </Section>
    </div>
  );
}
