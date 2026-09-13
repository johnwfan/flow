import type { StateRibbonSegment } from "@/types/api";
import { segmentBackground, stateVisual } from "@/lib/stateVisuals";

/**
 * The session's shape at a glance. Segments are square; only the ribbon's
 * two ends are round. Every state carries a texture as well as a hue, so
 * the ribbon survives greyscale, projection and colour-blindness — see the
 * design README's "State ribbon" component spec.
 */
export function StateRibbonBar({
  segments,
  height = 7,
  maxWidth,
}: {
  segments: StateRibbonSegment[];
  height?: number;
  maxWidth?: number;
}) {
  const total = segments.reduce((sum, s) => sum + s.durationS, 0);
  if (total === 0) {
    return <div style={{ height, borderRadius: "var(--r-pill)", background: "var(--sink)", maxWidth }} />;
  }

  return (
    <div
      style={{
        display: "flex",
        gap: 3,
        height,
        borderRadius: "var(--r-pill)",
        overflow: "hidden",
        maxWidth,
      }}
      role="img"
      aria-label={`Session state ribbon: ${segments
        .map((s) => `${stateVisual(s.state).name} for ${Math.round(s.durationS / 60)} minutes`)
        .join(", ")}`}
    >
      {segments.map((segment, i) => (
        <span
          key={i}
          style={{
            flex: Math.max(segment.durationS, 1),
            background: segmentBackground(segment.state),
          }}
        />
      ))}
    </div>
  );
}
