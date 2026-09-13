import { getInsights } from "@/lib/api";
import { Section } from "@/components/marketing/Section";
import { FocusWindowChart } from "@/components/insights/FocusWindowChart";
import { CategoryEffortChart } from "@/components/insights/CategoryEffortChart";
import { DistractionPatternChart } from "@/components/insights/DistractionPatternChart";
import { SettleTrendChart } from "@/components/insights/SettleTrendChart";
import { BreaksAndInterventions } from "@/components/insights/BreaksAndInterventions";
import { formatDuration } from "@/lib/format";
import { sessionCount } from "@/lib/patterns";

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

      <Section title="Focus window" description="How long deep work survives before the first drift.">
        <FocusWindowChart data={insights.focusWindow} sessionCount={sessions} />
      </Section>

      <Section title="Effort by app" description="Where the deep-work minutes actually went.">
        <CategoryEffortChart data={insights.effortByCategory} sessionCount={sessions} />
      </Section>

      <Section
        title="Where distraction concentrates"
        description="Same signal as effort by app, but for the drift -- every zoned-out and spiraling minute, ranked by what was on screen."
      >
        <DistractionPatternChart data={insights.distractionPatterns} sessionCount={sessions} />
      </Section>

      <Section title="Time to settle" description="Minutes from session start to the first stable deep-work stretch.">
        <SettleTrendChart data={insights.settleTrend} sessionCount={sessions} />
      </Section>

      <Section
        title="Breaks & interventions"
        description="Which breaks restored you, and whether the breathing loop moved anything."
      >
        <BreaksAndInterventions breakQuality={insights.breakQuality} interventionEfficacy={insights.interventionEfficacy} />
      </Section>
    </div>
  );
}
