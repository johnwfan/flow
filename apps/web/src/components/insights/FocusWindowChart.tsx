import type { FocusWindow } from "@/types/api";
import { NotEnoughData } from "@/components/ui/NotEnoughData";
import { PlotGrid } from "@/components/ui/PlotGrid";
import { MIN_SESSIONS_FOR_PATTERN } from "@/lib/patterns";

const HEIGHT = 150;
const VIEW_WIDTH = 600;

function axisTicks(decayCurve: FocusWindow["decayCurve"]): number[] {
  const maxMinute = Math.max(...decayCurve.map((d) => d.minute), 1);
  const steps = 4;
  return Array.from({ length: steps + 1 }, (_, i) => Math.round((maxMinute / steps) * i));
}

function CurveSvg({ data }: { data: FocusWindow }) {
  const maxMinute = Math.max(...data.decayCurve.map((d) => d.minute), 1);
  const pts = data.decayCurve.map((d): [number, number] => [
    (d.minute / maxMinute) * VIEW_WIDTH,
    HEIGHT - 6 - (d.pctStillFocused / 100) * (HEIGHT - 16),
  ]);
  const linePath = pts.map(([x, y], i) => `${i === 0 ? "M" : "L"}${x.toFixed(1)},${y.toFixed(1)}`).join(" ");
  const areaPath =
    `M${pts[0]![0].toFixed(1)},${HEIGHT} ` +
    pts.map(([x, y]) => `L${x.toFixed(1)},${y.toFixed(1)}`).join(" ") +
    ` L${pts[pts.length - 1]![0].toFixed(1)},${HEIGHT} Z`;

  const medianX = data.medianMinutes !== null ? (data.medianMinutes / maxMinute) * VIEW_WIDTH : null;
  const medianY =
    medianX !== null
      ? pts.reduce((closest, p) => (Math.abs(p[0] - medianX) < Math.abs(closest[0] - medianX) ? p : closest), pts[0]!)[1]
      : null;

  return (
    <svg
      viewBox={`0 0 ${VIEW_WIDTH} ${HEIGHT}`}
      width="100%"
      height={HEIGHT}
      preserveAspectRatio="none"
      role="img"
      aria-label={`Focus decay curve; still-focused percentage falling away, median drop-off around ${data.medianMinutes} minutes`}
    >
      <PlotGrid width={VIEW_WIDTH} height={HEIGHT} rows={3} />
      <path d={areaPath} fill="var(--deep-pale)" />
      <path d={linePath} fill="none" stroke="var(--deep)" strokeWidth={1.8} strokeLinejoin="round" strokeLinecap="round" />
      {medianX !== null && medianY !== null && (
        <>
          <line x1={medianX} y1={0} x2={medianX} y2={HEIGHT} stroke="var(--tick)" strokeWidth={1} />
          <circle cx={medianX} cy={medianY} r={3} fill="var(--deep-ink)" />
        </>
      )}
    </svg>
  );
}

export function FocusWindowChart({ data, sessionCount }: { data: FocusWindow; sessionCount: number }) {
  const hasEnough = sessionCount >= MIN_SESSIONS_FOR_PATTERN && data.decayCurve.length > 0 && data.medianMinutes !== null;

  return (
    <div>
      <div style={{ display: "flex", alignItems: "baseline", gap: "var(--s3)", flexWrap: "wrap" }}>
        <span
          style={{
            fontSize: 52,
            fontWeight: 500,
            letterSpacing: "-0.055em",
            lineHeight: 0.9,
            fontVariantNumeric: "tabular-nums",
            color: "var(--deep-ink)",
          }}
        >
          {data.medianMinutes ?? "—"}
        </span>
        <span style={{ fontSize: 20, color: "var(--body)" }}>
          {data.medianMinutes !== null ? "minutes, then attention starts to go" : "not enough sessions yet to say"}
        </span>
      </div>

      <div style={{ height: HEIGHT, marginTop: "var(--s5)" }}>
        {hasEnough ? (
          <CurveSvg data={data} />
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
            fontSize: 12,
            color: "var(--mute)",
            fontVariantNumeric: "tabular-nums",
          }}
        >
          {axisTicks(data.decayCurve).map((m, i) => (
            <span key={i}>{m}m</span>
          ))}
        </div>
      )}

      <div style={{ marginTop: "var(--s4)", fontSize: 15, color: "var(--mute)", lineHeight: 1.55, maxWidth: "62ch" }}>
        Measured as time from session start to the first sustained drift, across {sessionCount} session
        {sessionCount === 1 ? "" : "s"} with usable signal.
      </div>
    </div>
  );
}
