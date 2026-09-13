import { notFound } from "next/navigation";
import { getSession } from "@/lib/api";
import { PageHeader } from "@/components/layout/PageHeader";
import { Card } from "@/components/ui/Card";
import { StatTile } from "@/components/ui/StatTile";
import { NarrativeBlock } from "@/components/session-detail/NarrativeBlock";
import { PhysioTimeline } from "@/components/session-detail/PhysioTimeline";
import { CategoryRibbon } from "@/components/session-detail/CategoryRibbon";
import { AlertsList } from "@/components/session-detail/AlertsList";
import { ProbeComparisonTable } from "@/components/session-detail/ProbeComparisonTable";
import { DistractionInsights } from "@/components/session-detail/DistractionInsights";
import { formatDate, formatDuration } from "@/lib/format";

export default async function SessionDetailPage({ params }: { params: { id: string } }) {
  const detail = await getSession(params.id);
  if (!detail) notFound();

  const { summary, timeline, alerts, contexts, probes, insights } = detail;

  return (
    <>
      <PageHeader title={formatDate(summary.startedAt)} subtitle="Session detail" />

      <div className="space-y-6">
        <NarrativeBlock narrative={summary.narrative} />

        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <StatTile label="Duration" value={formatDuration(summary.durationS)} />
          <StatTile label="Focus time" value={formatDuration(summary.focusTimeS)} />
          <StatTile label="Alerts" value={String(alerts.length)} />
          <StatTile label="Probes answered" value={String(probes.length)} />
        </div>

        <Card>
          <h3 className="mb-4 text-base font-semibold text-ink">Physiology timeline</h3>
          <PhysioTimeline timeline={timeline} alerts={alerts} />
          <div className="mt-4">
            <CategoryRibbon contexts={contexts} startedAt={summary.startedAt} endedAt={summary.endedAt} />
          </div>
        </Card>

        <Card>
          <h3 className="mb-3 text-base font-semibold text-ink">Distraction insights</h3>
          <DistractionInsights insights={insights} />
        </Card>

        <Card>
          <h3 className="mb-3 text-base font-semibold text-ink">Alerts</h3>
          <AlertsList alerts={alerts} />
        </Card>

        <Card>
          <h3 className="mb-3 text-base font-semibold text-ink">Thought probes</h3>
          <ProbeComparisonTable probes={probes} />
        </Card>
      </div>
    </>
  );
}
