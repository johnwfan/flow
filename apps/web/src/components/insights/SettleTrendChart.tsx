import type { SettlePoint } from "@/types/api";
import { NotEnoughData } from "@/components/ui/NotEnoughData";
import { PlotGrid } from "@/components/ui/PlotGrid";
import { formatShortDate } from "@/lib/format";
import { MIN_SESSIONS_FOR_PATTERN } from "@/lib/patterns";
import { WrittenForYou } from "./WrittenForYou";

const HEIGHT = 120;
const VIEW_WIDTH = 600;

type SettledPoint = { sessionId: string; date: string; settleSeconds: number };

function SettleSvg({ points }: { points: SettledPoint[] }) {
  const minutes = points.map((p) => p.settleSeconds / 60);
  const lo = Math.min(...minutes);
  const hi = Math.max(...minutes, lo + 1);
  const pts = minutes.map((v, i): [number, number] => [
    points.length > 1 ? (i / (points.length - 1)) * (VIEW_WIDTH - 12) + 6 : VIEW_WIDTH / 2,
    HEIGHT - 8 - ((v - lo) / (hi - lo || 1)) * (HEIGHT - 20),
  ]);
  const linePath = pts.map(([x, y], i) => `${i === 0 ? "M" : "L"}${x.toFixed(1)},${y.toFixed(1)}`).join(" ");

  return (
    <svg
      viewBox={`0 0 ${VIEW_WIDTH} ${HEIGHT}`}
      width="100%"
      height={HEIGHT}
      preserveAspectRatio="none"
      role="img"
      aria-label={`Line chart of time to settle across the last ${points.length} sessions`}
    >
      <PlotGrid width={VIEW_WIDTH} height={HEIGHT} rows={3} />
      <path d={linePath} fill="none" stroke="var(--deep)" strokeWidth={1.8} strokeLinejoin="round" strokeLinecap="round" />
      {pts.map(([x, y], i) => (
        <circle key={i} cx={x} cy={y} r={i === pts.length - 1 ? 3.2 : 2} fill={i === pts.length - 1 ? "var(--deep-ink)" : "var(--deep-mid)"} />
      ))}
    </svg>
  );
}

function headline(points: SettledPoint[]): { value: string; note: string } {
  const last = points[points.length - 1]!;
  const lastM = last.settleSeconds / 60;
  if (points.length < 2) return { value: `${Math.round(lastM)} m`, note: "last session" };

  const first = points[0]!;
  const firstM = first.settleSeconds / 60;
  const diff = firstM - lastM;
  if (Math.abs(diff) < 0.5) {
    return { value: `${Math.round(lastM)} m`, note: `steady across ${points.length} sessions` };
  }
  const dir = diff > 0 ? "down from" : "up from";
  return { value: `${Math.round(lastM)} m`, note: `last session · ${dir} ${Math.round(firstM)} m, ${points.length} sessions ago` };
}

function settleNote(points: SettledPoint[], sessionCount: number, hasEnough: boolean): string {
  if (!hasEnough) {
    return `Not enough settled sessions yet to show a trend -- ${sessionCount} of ${MIN_SESSIONS_FOR_PATTERN} needed.`;
  }
  const first = points[0]!.settleSeconds;
  const last = points[points.length - 1]!.settleSeconds;
  if (last < first * 0.85) return "You are settling meaningfully faster than you used to. Whatever changed about how you start, it is working.";
  if (last > first * 1.15) return "Settling has been slower lately -- recent sessions are starting with more warm-up time than before.";
  return "Time to settle has stayed roughly steady across your recent sessions.";
}

export function SettleTrendChart({ data, sessionCount }: { data: SettlePoint[]; sessionCount: number }) {
  const points = data.filter((p): p is SettledPoint => p.settleSeconds !== null);
  const hasEnough = points.length >= 2 && sessionCount >= MIN_SESSIONS_FOR_PATTERN;
  const { value, note } = points.length > 0 ? headline(points) : { value: "—", note: "no settled sessions yet" };

  return (
    <div>
      <div style={{ display: "flex", alignItems: "baseline", gap: "var(--s3)", flexWrap: "wrap" }}>
        <span style={{ fontSize: 24, fontWeight: 500, letterSpacing: "-0.04em", fontVariantNumeric: "tabular-nums" }}>
          {value}
        </span>
        <span style={{ fontSize: 13, color: "var(--body)" }}>{note}</span>
      </div>

      <div style={{ height: HEIGHT, marginTop: "var(--s4)" }}>
        {hasEnough ? (
          <SettleSvg points={points} />
        ) : (
          <NotEnoughData height={HEIGHT} have={sessionCount} need={MIN_SESSIONS_FOR_PATTERN} />
        )}
      </div>

      {hasEnough && (
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            marginTop: 7,
            fontSize: 10,
            color: "var(--mute)",
            fontVariantNumeric: "tabular-nums",
          }}
        >
          <span>{formatShortDate(points[0]!.date)}</span>
          <span>last</span>
        </div>
      )}

      <WrittenForYou text={settleNote(points, sessionCount, hasEnough)} />
    </div>
  );
}
