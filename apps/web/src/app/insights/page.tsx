import { getInsights } from "@/lib/api";
import { PageHeader } from "@/components/layout/PageHeader";
import { InsightCard } from "@/components/insights/InsightCard";
import { FocusWindowChart } from "@/components/insights/FocusWindowChart";
import { CategoryEffortChart } from "@/components/insights/CategoryEffortChart";
import { SettleTrendChart } from "@/components/insights/SettleTrendChart";
import { BreakQualityTiles } from "@/components/insights/BreakQualityTiles";
import { InterventionEfficacyChart } from "@/components/insights/InterventionEfficacyChart";

export default async function InsightsPage() {
  const insights = await getInsights();

  return (
    <>
      <PageHeader title="Insights" subtitle="Patterns across all your sessions." />
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <InsightCard title="Focus window" description="How long you typically stay focused before drifting.">
          <FocusWindowChart data={insights.focusWindow} />
        </InsightCard>
        <InsightCard title="Effort by category" description="Where your focused time actually goes.">
          <CategoryEffortChart data={insights.effortByCategory} />
        </InsightCard>
        <InsightCard title="Time to settle" description="How quickly you reach focus, session over session.">
          <SettleTrendChart data={insights.settleTrend} />
        </InsightCard>
        <InsightCard title="Break quality" description="Do your breaks help you come back focused?">
          <BreakQualityTiles data={insights.breakQuality} />
        </InsightCard>
        <InsightCard title="Intervention efficacy" description="Breathing rate before and after each alert.">
          <InterventionEfficacyChart data={insights.interventionEfficacy} />
        </InsightCard>
      </div>
    </>
  );
}
