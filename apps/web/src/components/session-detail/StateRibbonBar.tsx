import type { StateRibbonSegment } from "@/types/api";
import { stateColor, stateLabel } from "@/lib/colors";

export function StateRibbonBar({ segments }: { segments: StateRibbonSegment[] }) {
  const total = segments.reduce((sum, s) => sum + s.durationS, 0);
  if (total === 0) {
    return <div className="h-2 w-full rounded-full bg-border" />;
  }

  return (
    <div className="flex h-2 w-full overflow-hidden rounded-full">
      {segments.map((segment, i) => (
        <div
          key={i}
          title={`${stateLabel(segment.state)} — ${Math.round(segment.durationS / 60)}m`}
          style={{ width: `${(segment.durationS / total) * 100}%`, backgroundColor: stateColor(segment.state) }}
        />
      ))}
    </div>
  );
}
