import type { StateRibbonSegment } from "@/types/api";
import { STATE_ORDER, segmentBackground, stateVisual } from "@/lib/stateVisuals";

/** Mono chips showing each state's texture, in canonical order, for states actually present. */
export function StateLegend({ segments }: { segments: StateRibbonSegment[] }) {
  const present = new Set(segments.map((s) => s.state));
  const states = STATE_ORDER.filter((s) => present.has(s));
  if (states.length === 0) return null;

  return (
    <div
      style={{
        display: "flex",
        gap: "var(--s4)",
        flexWrap: "wrap",
        fontFamily: "var(--mono)",
        fontSize: 10.5,
        color: "var(--body)",
        marginBottom: "var(--s5)",
      }}
    >
      {states.map((state) => (
        <span key={state} style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
          <span
            style={{
              width: 14,
              height: 8,
              borderRadius: 2,
              display: "inline-block",
              background: segmentBackground(state),
            }}
          />
          {stateVisual(state).name}
        </span>
      ))}
    </div>
  );
}
