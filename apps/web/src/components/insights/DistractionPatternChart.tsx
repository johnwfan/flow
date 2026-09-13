import type { DistractionPattern } from "@/types/api";
import { NotEnoughData } from "@/components/ui/NotEnoughData";
import { MIN_SESSIONS_FOR_PATTERN } from "@/lib/patterns";
import { BarsList, CAT_VARS } from "./BarsList";
import { distractionPatternLabel } from "./presentation";

const PLACEHOLDER_HEIGHT = 180;
const MAX_ROWS = 6;

/** Cross-session counterpart to "Effort by app": same Bars chart vocabulary,
 * but ranking where zoned-out and spiraling minutes concentrated across
 * every session, not just one. */
export function DistractionPatternChart({ data, sessionCount }: { data: DistractionPattern[]; sessionCount: number }) {
  const hasEnough = data.length > 0 && sessionCount >= MIN_SESSIONS_FOR_PATTERN;
  const top = data.slice(0, MAX_ROWS);

  return (
    <div>
      {hasEnough ? (
        <BarsList
          items={top.map((p, i) => ({
            label: distractionPatternLabel(p),
            value: `${p.avgMinutesPerEpisode}m/check`,
            pct: Math.max(4, Math.round((p.avgMinutesPerEpisode / top[0]!.avgMinutesPerEpisode) * 100)),
            colorVar: CAT_VARS[Math.min(i, CAT_VARS.length - 1)]!,
          }))}
        />
      ) : (
        <NotEnoughData height={PLACEHOLDER_HEIGHT} have={sessionCount} need={MIN_SESSIONS_FOR_PATTERN} />
      )}
    </div>
  );
}
