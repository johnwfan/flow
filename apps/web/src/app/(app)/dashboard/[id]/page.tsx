import Link from "next/link";
import { notFound } from "next/navigation";
import { getSession } from "@/lib/api";
import { RuleGridSection } from "@/components/ui/RuleGridSection";
import { SessionDetailHeader } from "@/components/session-detail/SessionDetailHeader";
import { NarrativeBlock } from "@/components/session-detail/NarrativeBlock";
import { RegenerateSessionInsightsButton } from "@/components/session-detail/RegenerateSessionInsightsButton";
import { DistractionInsights } from "@/components/session-detail/DistractionInsights";
import { SessionTrace } from "@/components/session-detail/SessionTrace";
import { CheckInsList } from "@/components/session-detail/CheckInsList";
import { InterventionsList } from "@/components/session-detail/InterventionsList";
import { sessionAgreement, settleSeconds } from "@/lib/sessionMetrics";

export default async function SessionDetailPage({ params }: { params: { id: string } }) {
  const detail = await getSession(params.id);
  if (!detail) notFound();

  const { summary, timeline, alerts, contexts, probes, insights } = detail;
  const settleSecs = settleSeconds(summary.stateRibbon);
  const { pct: agreementPct } = sessionAgreement(probes);

  return (
    <>
      <Link
        href="/dashboard"
        style={{
          display: "inline-block",
          padding: "6px 13px",
          margin: "0 0 var(--s5) -12px",
          borderRadius: "var(--r-pill)",
          background: "transparent",
          color: "var(--body)",
          fontSize: 12.5,
        }}
      >
        &larr; All sessions
      </Link>

      <SessionDetailHeader
        summary={summary}
        settleSecs={settleSecs}
        agreementPct={agreementPct}
        distractionPct={insights.distractionPct}
      />

      <RuleGridSection
        title="What happened"
        description="Written for you from this session's own signal."
        style={{ marginTop: "var(--s6)" }}
      >
        <div style={{ display: "grid", gap: "var(--s5)" }}>
          <RegenerateSessionInsightsButton sessionId={summary.id} />
          <NarrativeBlock narrative={summary.narrative} ribbon={summary.stateRibbon} insights={insights} />
        </div>
      </RuleGridSection>

      <RuleGridSection title="What pulled you away" description="Where the session's attention went, and for how long.">
        <DistractionInsights insights={insights} />
      </RuleGridSection>

      <RuleGridSection
        title="How it went"
        description="States over the physiology, alerts where they fired, apps underneath."
      >
        <SessionTrace
          ribbon={summary.stateRibbon}
          timeline={timeline}
          alerts={alerts}
          contexts={contexts}
          startedAt={summary.startedAt}
          endedAt={summary.endedAt}
        />
      </RuleGridSection>

      <RuleGridSection title="Check-ins" description="What you said, against what the classifier thought at that moment.">
        <CheckInsList probes={probes} />
      </RuleGridSection>

      <RuleGridSection title="When Flow stepped in" description="What changed after each moment Flow spoke up.">
        <InterventionsList alerts={alerts} timeline={timeline} distractionWindows={insights.distractionWindows} />
      </RuleGridSection>
    </>
  );
}
