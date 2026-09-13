import { StatFigure } from "@/components/ui/StatFigure";

export function WeekStats({
  sessionCount,
  deepWorkLabel,
  medianSettleLabel,
  agreementLabel,
}: {
  sessionCount: number;
  deepWorkLabel: string;
  medianSettleLabel: string;
  agreementLabel: string;
}) {
  return (
    <div style={{ display: "flex", gap: "var(--s8)", marginTop: "var(--s6)", flexWrap: "wrap" }}>
      <StatFigure label="This week" value={`${sessionCount} session${sessionCount === 1 ? "" : "s"}`} />
      <StatFigure label="Deep work" value={deepWorkLabel} color="var(--deep-ink)" />
      <StatFigure label="Median settle" value={medianSettleLabel} />
      <StatFigure label="Agreement" value={agreementLabel} />
    </div>
  );
}
