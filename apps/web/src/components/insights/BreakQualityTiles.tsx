import type { BreakQuality } from "@/types/api";
import { StatTile } from "@/components/ui/StatTile";

export function BreakQualityTiles({ data }: { data: BreakQuality }) {
  const total = data.restorative + data.depleting;
  if (total === 0) {
    return <p className="text-sm text-muted">No pause/resume breaks recorded yet.</p>;
  }

  return (
    <div className="grid grid-cols-2 gap-3">
      <StatTile label="Restorative" value={String(data.restorative)} hint="focused again within 3m" />
      <StatTile label="Depleting" value={String(data.depleting)} hint="took longer to refocus" />
    </div>
  );
}
