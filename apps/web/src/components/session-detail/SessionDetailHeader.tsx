import type { SessionSummary } from "@/types/api";
import { formatClock, formatDayEyebrow, formatHM, sessionTitle } from "@/lib/format";
import { stateVisual } from "@/lib/stateVisuals";
import { StatFigure } from "@/components/ui/StatFigure";
import { StateRibbonBar } from "./StateRibbonBar";

/**
 * Session-detail header: state dot + date-range eyebrow, title, ribbon,
 * and the stat row — Deep work / Duration / Settled in / Agreement, plus
 * "Distracted" as the 5th stat (placement b of the distraction insights).
 */
export function SessionDetailHeader({
  summary,
  settleSecs,
  agreementPct,
  distractionPct,
}: {
  summary: SessionSummary;
  settleSecs: number | null;
  agreementPct: number | null;
  distractionPct: number;
}) {
  const endingState = summary.stateRibbon.length > 0 ? summary.stateRibbon[summary.stateRibbon.length - 1]!.state : null;
  const dotColor = endingState ? stateVisual(endingState).color : "var(--ink)";

  return (
    <div style={{ display: "flex", alignItems: "flex-end", justifyContent: "space-between", gap: "var(--s7)", flexWrap: "wrap" }}>
      <div style={{ minWidth: 300 }}>
        <div style={{ display: "flex", alignItems: "center", gap: "var(--s2)", marginBottom: 10 }}>
          <span style={{ width: 7, height: 7, borderRadius: 2.5, background: dotColor }} />
          <span style={{ fontFamily: "var(--mono)", fontSize: 10.5, color: "var(--mute)" }}>
            {formatDayEyebrow(summary.startedAt)} · {formatClock(summary.startedAt)}
            {summary.endedAt ? ` – ${formatClock(summary.endedAt)}` : ""}
          </span>
        </div>
        <h1 style={{ margin: 0, fontSize: 36, fontWeight: 500, letterSpacing: "-0.045em" }}>{sessionTitle(summary.startedAt)}</h1>
        <div style={{ marginTop: "var(--s4)", maxWidth: 340 }}>
          <StateRibbonBar segments={summary.stateRibbon} height={10} />
        </div>
      </div>
      <div style={{ display: "flex", gap: "var(--s7)", flexWrap: "wrap" }}>
        <StatFigure label="Deep work" value={formatHM(summary.focusTimeS)} color="var(--deep-ink)" />
        <StatFigure label="Duration" value={formatHM(summary.durationS)} />
        <StatFigure label="Settled in" value={settleSecs !== null ? `${Math.round(settleSecs / 60)} m` : "—"} />
        <StatFigure label="Agreement" value={agreementPct !== null ? `${agreementPct}%` : "—"} />
        <StatFigure label="Distracted" value={`${Math.round(distractionPct)}%`} color="var(--zoned-ink)" />
      </div>
    </div>
  );
}
