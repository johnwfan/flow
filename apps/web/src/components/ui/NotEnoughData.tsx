// The design system's "not-enough-data" state: a chart never draws a trend
// it can't support. Fills its box with the --none hatch, states what it
// still needs, and reserves the space the real chart will occupy so the
// layout doesn't jump once there's enough signal.
export function NotEnoughData({
  height = 150,
  have,
  need,
  unit = "sessions",
}: {
  height?: number;
  have: number;
  need: number;
  unit?: string;
}) {
  const label = `${have} of ${need} ${unit} needed`;
  return (
    <div
      role="img"
      aria-label={`Not enough data yet: ${label}`}
      style={{
        height,
        background: "var(--none-hatch)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
      }}
    >
      <span
        style={{
          padding: "7px 14px",
          borderRadius: "var(--r-pill)",
          background: "var(--paper)",
          fontFamily: "var(--num)",
          fontSize: 11.5,
          color: "var(--mute)",
          fontVariantNumeric: "tabular-nums",
          whiteSpace: "nowrap",
        }}
      >
        {label}
      </span>
    </div>
  );
}
