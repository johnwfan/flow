import type { DistractionPattern } from "@/types/api";
import { categoryLabel } from "@/lib/colors";
import { NotEnoughData } from "@/components/ui/NotEnoughData";
import { MIN_SESSIONS_FOR_PATTERN } from "@/lib/patterns";
import { BarsList, CAT_VARS } from "./BarsList";
import { WrittenForYou } from "./WrittenForYou";

const PLACEHOLDER_HEIGHT = 180;
const MAX_ROWS = 6;

function label(p: DistractionPattern): string {
  if (p.appTitle) return p.appTitle.length > 42 ? `${p.appTitle.slice(0, 39)}…` : p.appTitle;
  if (p.category) return categoryLabel(p.category);
  return "Unknown";
}

function distractionNote(data: DistractionPattern[], sessionCount: number): string {
  const top = data[0];
  if (!top) return "Not enough distracted time recorded yet to say what costs the most per check.";
  const avg = top.avgMinutesPerEpisode;
  const totalMinutes = Math.round(top.minutes);
  return `${label(top)} costs you the most per check -- averaging ${avg} minute${avg === 1 ? "" : "s"} before you're back to deep work, across ${top.episodes} check-in${top.episodes === 1 ? "" : "s"}. ${totalMinutes} minute${totalMinutes === 1 ? "" : "s"} lost in total across ${sessionCount} session${sessionCount === 1 ? "" : "s"}.`;
}

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
            label: label(p),
            value: `${p.avgMinutesPerEpisode}m/check`,
            pct: Math.max(4, Math.round((p.avgMinutesPerEpisode / top[0]!.avgMinutesPerEpisode) * 100)),
            colorVar: CAT_VARS[Math.min(i, CAT_VARS.length - 1)]!,
          }))}
        />
      ) : (
        <NotEnoughData height={PLACEHOLDER_HEIGHT} have={sessionCount} need={MIN_SESSIONS_FOR_PATTERN} />
      )}
      <WrittenForYou text={distractionNote(data, sessionCount)} />
    </div>
  );
}
