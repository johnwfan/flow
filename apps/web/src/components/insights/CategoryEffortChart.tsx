import type { CategoryEffort } from "@/types/api";
import { categoryLabel } from "@/lib/colors";
import { NotEnoughData } from "@/components/ui/NotEnoughData";
import { MIN_SESSIONS_FOR_PATTERN } from "@/lib/patterns";
import { BarsList, CAT_VARS } from "./BarsList";
import { WrittenForYou } from "./WrittenForYou";

const PLACEHOLDER_HEIGHT = 180;

function effortNote(data: CategoryEffort[], sessionCount: number): string {
  const top = data[0];
  if (!top) return "Not enough categorized app time yet to say where your effort goes.";
  const total = data.reduce((sum, d) => sum + d.minutes, 0);
  const share = total > 0 ? Math.round((top.minutes / total) * 100) : 0;
  return `${categoryLabel(top.category)} carries the most of your tracked effort -- ${Math.round(top.minutes)} minute${Math.round(top.minutes) === 1 ? "" : "s"} (${share}%) across ${sessionCount} session${sessionCount === 1 ? "" : "s"}.`;
}

export function CategoryEffortChart({ data, sessionCount }: { data: CategoryEffort[]; sessionCount: number }) {
  const hasEnough = data.length > 0 && sessionCount >= MIN_SESSIONS_FOR_PATTERN;

  return (
    <div>
      {hasEnough ? (
        <BarsList
          items={data.map((d, i) => ({
            label: categoryLabel(d.category),
            value: `${Math.round(d.minutes)}m`,
            pct: Math.max(4, Math.round((d.minutes / data[0]!.minutes) * 100)),
            colorVar: CAT_VARS[Math.min(i, CAT_VARS.length - 1)]!,
          }))}
        />
      ) : (
        <NotEnoughData height={PLACEHOLDER_HEIGHT} have={sessionCount} need={MIN_SESSIONS_FOR_PATTERN} />
      )}
      <WrittenForYou text={effortNote(data, sessionCount)} />
    </div>
  );
}
