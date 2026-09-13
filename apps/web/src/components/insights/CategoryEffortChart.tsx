import type { CategoryEffort } from "@/types/api";
import { categoryLabel } from "@/lib/colors";
import { NotEnoughData } from "@/components/ui/NotEnoughData";
import { MIN_SESSIONS_FOR_PATTERN } from "@/lib/patterns";
import { BarsList, CAT_VARS } from "./BarsList";

const PLACEHOLDER_HEIGHT = 180;

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
    </div>
  );
}
