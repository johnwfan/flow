import type { SessionFocusPoint } from "@/types/api";
import { NotEnoughData } from "@/components/ui/NotEnoughData";
import { MIN_SESSIONS_FOR_PATTERN } from "@/lib/patterns";
import { BarsList } from "./BarsList";
import { groupByDaypart } from "./presentation";

const PLACEHOLDER_HEIGHT = 180;

export function DaypartFocusChart({ data, sessionCount }: { data: SessionFocusPoint[]; sessionCount: number }) {
  const hasEnough = sessionCount >= MIN_SESSIONS_FOR_PATTERN && data.length > 0;
  const stats = hasEnough ? groupByDaypart(data) : [];

  return (
    <div>
      {stats.length > 0 ? (
        <BarsList
          items={stats.map((s) => ({
            label: `${s.label} (${s.sessions})`,
            value: `${s.avgPct}%`,
            pct: s.avgPct,
            colorVar: "--deep-mid",
          }))}
        />
      ) : (
        <NotEnoughData height={PLACEHOLDER_HEIGHT} have={sessionCount} need={MIN_SESSIONS_FOR_PATTERN} />
      )}
    </div>
  );
}
