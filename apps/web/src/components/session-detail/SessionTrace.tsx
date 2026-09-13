import type { EventRow, StateRibbonSegment, TimelineBucket } from "@/types/api";
import { formatClock } from "@/lib/format";
import { StateLegend } from "./StateLegend";
import { StateRibbonBar } from "./StateRibbonBar";
import { CategoryRibbon } from "./CategoryRibbon";

const VBW = 1000;
const VBH = 152;

interface TracePoint {
  x: number;
  y: number;
  yTop: number;
  yBot: number;
}

/**
 * Splits the pulse trace into contiguous segments around signal-loss gaps
 * — the polyline is never drawn across a gap (design README "Signal-lost
 * overlay"). The HRV envelope's half-width is derived from `avgHrvMs`,
 * scaled the same way the prototype's synthetic trace was.
 */
function buildTrace(timeline: TimelineBucket[], startMs: number, totalMs: number) {
  const values = timeline.map((b) => b.avgPulseBpm).filter((v): v is number => v !== null);
  const lo = values.length ? Math.min(...values) : 50;
  const hi = values.length ? Math.max(...values) : 90;
  const pad = Math.max((hi - lo) * 0.15, 2);
  const loY = lo - pad;
  const span = Math.max(hi + pad - loY, 1);
  const yOf = (v: number) => VBH - 10 - ((v - loY) / span) * (VBH - 22);

  const segments: TracePoint[][] = [];
  const gaps: { x0: number; x1: number }[] = [];
  let current: TracePoint[] | null = null;
  let gapStart: number | null = null;

  for (const bucket of timeline) {
    const tMs = new Date(bucket.bucket).getTime();
    const xPct = Math.min(100, Math.max(0, ((tMs - startMs) / totalMs) * 100));
    if (bucket.avgPulseBpm === null) {
      current = null;
      if (gapStart === null) gapStart = xPct;
      continue;
    }
    if (gapStart !== null) {
      gaps.push({ x0: gapStart, x1: xPct });
      gapStart = null;
    }
    if (!current) {
      current = [];
      segments.push(current);
    }
    const y = yOf(bucket.avgPulseBpm);
    const half = Math.min(16, Math.max(2, (bucket.avgHrvMs ?? 40) / 24));
    current.push({ x: (xPct / 100) * VBW, y, yTop: y - half, yBot: y + half });
  }
  return { segments, gaps };
}

/**
 * "How it went": marker lane + state ribbon + HR trace (with HRV envelope
 * and vertical alert stems) + app-category ribbon + clock axis, all
 * derived from the same session data so they can never disagree.
 */
export function SessionTrace({
  ribbon,
  timeline,
  alerts,
  contexts,
  startedAt,
  endedAt,
}: {
  ribbon: StateRibbonSegment[];
  timeline: TimelineBucket[];
  alerts: EventRow[];
  contexts: EventRow[];
  startedAt: string;
  endedAt: string | null;
}) {
  const startMs = new Date(startedAt).getTime();
  const sorted = [...timeline].sort((a, b) => new Date(a.bucket).getTime() - new Date(b.bucket).getTime());
  const lastBucketMs = sorted.length ? new Date(sorted[sorted.length - 1]!.bucket).getTime() : startMs;
  const endMs = endedAt ? new Date(endedAt).getTime() : Math.max(lastBucketMs, startMs + 1);
  const totalMs = Math.max(endMs - startMs, 1);

  const { segments, gaps } = buildTrace(sorted, startMs, totalMs);

  const alertMarks = alerts.map((a) => {
    const type = String(a.payload["type"] ?? a.kind);
    const pct = Math.min(100, Math.max(0, ((new Date(a.ts).getTime() - startMs) / totalMs) * 100));
    const isSpiral = type === "spiral";
    return {
      pct,
      label: type,
      ink: isSpiral ? "var(--spiral-ink)" : "var(--zoned-ink)",
      mid: isSpiral ? "var(--spiral-mid)" : "var(--zoned-mid)",
    };
  });

  const axisTimes = [0, 0.25, 0.5, 0.75, 1].map((f) => new Date(startMs + f * totalMs).toISOString());

  return (
    <div>
      <StateLegend segments={ribbon} />

      <div style={{ position: "relative", height: 20 }}>
        {alertMarks.map((m, i) => (
          <span
            key={i}
            style={{
              position: "absolute",
              bottom: 0,
              left: `${m.pct}%`,
              transform: "translateX(-50%)",
              fontFamily: "var(--mono)",
              fontSize: 10,
              color: m.ink,
              whiteSpace: "nowrap",
            }}
          >
            {m.label}
          </span>
        ))}
      </div>

      <StateRibbonBar segments={ribbon} height={18} />

      <div style={{ position: "relative", height: VBH, marginTop: "var(--s4)" }}>
        <svg
          viewBox={`0 0 ${VBW} ${VBH}`}
          preserveAspectRatio="none"
          style={{ width: "100%", height: VBH, display: "block" }}
          role="img"
          aria-label={`Heart rate across the session${gaps.length ? ", with a gap where the signal was lost" : ""}`}
        >
          {[1, 2, 3].map((i) => (
            <line key={`h${i}`} x1={0} x2={VBW} y1={(VBH / 4) * i} y2={(VBH / 4) * i} stroke="var(--line-soft)" strokeWidth={1} />
          ))}
          {[1, 2, 3].map((i) => (
            <line key={`v${i}`} x1={(VBW / 4) * i} x2={(VBW / 4) * i} y1={0} y2={VBH} stroke="var(--line-soft)" strokeWidth={1} />
          ))}
          {segments.map(
            (seg, i) =>
              seg.length > 1 && (
                <g key={i}>
                  <polygon
                    points={[...seg.map((p) => `${p.x},${p.yTop}`), ...[...seg].reverse().map((p) => `${p.x},${p.yBot}`)].join(" ")}
                    fill="var(--deep-pale)"
                  />
                  <polyline
                    points={seg.map((p) => `${p.x},${p.y}`).join(" ")}
                    fill="none"
                    stroke="var(--deep)"
                    strokeWidth={1.8}
                    strokeLinejoin="round"
                    strokeLinecap="round"
                  />
                </g>
              ),
          )}
        </svg>
        {gaps.map((g, i) => (
          <div
            key={i}
            style={{
              position: "absolute",
              top: 0,
              bottom: 0,
              left: `${g.x0}%`,
              width: `${g.x1 - g.x0}%`,
              background: "var(--none-hatch)",
            }}
          />
        ))}
        {alertMarks.map((m, i) => (
          <span
            key={`stem-${i}`}
            style={{ position: "absolute", top: 0, bottom: 0, left: `${m.pct}%`, width: 1, background: m.mid }}
          />
        ))}
        {timeline.length === 0 && (
          <p style={{ position: "absolute", top: 8, left: 8, fontSize: 12.5, color: "var(--mute)" }}>
            No physiology data recorded for this session.
          </p>
        )}
      </div>

      <div style={{ marginTop: "var(--s3)" }}>
        <CategoryRibbon contexts={contexts} startedAt={startedAt} endedAt={endedAt} />
      </div>

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
        {axisTimes.map((t, i) => (
          <span key={i}>{formatClock(t)}</span>
        ))}
      </div>
    </div>
  );
}
