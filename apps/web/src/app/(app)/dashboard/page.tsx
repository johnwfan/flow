import { getInsights, getSessions } from "@/lib/api";
import { RuleGridSection } from "@/components/ui/RuleGridSection";
import { WeekStats } from "@/components/dashboard/WeekStats";
import { SessionList } from "@/components/dashboard/SessionList";
import { EmptyState } from "@/components/dashboard/EmptyState";
import { formatHM, formatMinutesLabel } from "@/lib/format";
import { median, settleSeconds } from "@/lib/sessionMetrics";

const WEEK_MS = 7 * 24 * 60 * 60 * 1000;

export default async function DashboardPage() {
  const sessions = await getSessions();

  if (sessions.length === 0) {
    return (
      <>
        <div style={{ fontFamily: "var(--mono)", fontSize: 10.5, color: "var(--mute)", marginBottom: 10 }}>
          history · 0 sessions
        </div>
        <h1 style={{ margin: 0, fontSize: 36, fontWeight: 500, letterSpacing: "-0.045em" }}>Your sessions</h1>
        <EmptyState />
      </>
    );
  }

  const insights = await getInsights();

  const now = Date.now();
  const thisWeek = sessions.filter((s) => now - new Date(s.startedAt).getTime() <= WEEK_MS);
  const deepWorkS = thisWeek.reduce((sum, s) => sum + s.focusTimeS, 0);
  const settleValues = thisWeek.map((s) => settleSeconds(s.stateRibbon)).filter((v): v is number => v !== null);
  const medianSettle = median(settleValues);
  const agreementPct = Math.round(insights.validation.agreementRate * 100);

  return (
    <>
      <div style={{ fontFamily: "var(--mono)", fontSize: 10.5, color: "var(--mute)", marginBottom: 10 }}>
        history · {sessions.length} session{sessions.length === 1 ? "" : "s"}
      </div>
      <h1 style={{ margin: 0, fontSize: 36, fontWeight: 500, letterSpacing: "-0.045em" }}>Your sessions</h1>
      <p style={{ margin: "var(--s3) 0 0", fontSize: 18, lineHeight: 1.55, color: "var(--body)", maxWidth: "58ch" }}>
        Every session keeps its own shape. The ribbon is the whole session at a glance — where you held, where you
        drifted, where the signal went.
      </p>

      <WeekStats
        sessionCount={thisWeek.length}
        deepWorkLabel={formatHM(deepWorkS)}
        medianSettleLabel={formatMinutesLabel(medianSettle)}
        agreementLabel={`${agreementPct}%`}
      />

      <RuleGridSection title="Recent" description="Newest first. Open one for the written account." style={{ marginTop: "var(--s6)" }}>
        <SessionList sessions={sessions} />
      </RuleGridSection>
    </>
  );
}
