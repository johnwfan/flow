/** A single tabular stat figure — the header-stats / weekly-stats row unit. */
export function StatFigure({ label, value, color = "var(--ink)" }: { label: string; value: string; color?: string }) {
  return (
    <div>
      <div style={{ fontSize: 11.5, color: "var(--mute)", marginBottom: 6 }}>{label}</div>
      <div
        style={{
          fontSize: 24,
          fontWeight: 500,
          letterSpacing: "-0.04em",
          fontVariantNumeric: "tabular-nums",
          color,
        }}
      >
        {value}
      </div>
    </div>
  );
}
