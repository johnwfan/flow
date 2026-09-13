import type { DistractionWindow, EventRow, TimelineBucket } from "@/types/api";
import { formatClock } from "@/lib/format";
import { avgAround, findOverlappingWindow, fmtMeasure } from "@/lib/sessionMetrics";

function humanizeReasons(reasons: unknown): string {
  if (!Array.isArray(reasons) || reasons.length === 0) return "";
  return (reasons as string[]).map((r) => r.replace(/_/g, " ")).join(", ");
}

/**
 * "When Flow stepped in" — one entry per alert, with a before→after
 * physiology measure (derived from the session's own timeline buckets
 * around the alert, since before/after values aren't persisted on the
 * event itself) and, per placement (c), a one-line mention of the app
 * active during any distraction window the alert's timing overlaps.
 */
export function InterventionsList({
  alerts,
  timeline,
  distractionWindows,
}: {
  alerts: EventRow[];
  timeline: TimelineBucket[];
  distractionWindows: DistractionWindow[];
}) {
  if (alerts.length === 0) {
    return <p style={{ fontSize: 13, color: "var(--mute)" }}>Flow didn&apos;t need to step in this session.</p>;
  }

  return (
    <div>
      {alerts.map((alert, i) => {
        const type = String(alert.payload["type"] ?? "alert");
        const isSpiral = type === "spiral";
        const color = isSpiral ? "var(--spiral)" : "var(--zoned)";
        const ink = isSpiral ? "var(--spiral-ink)" : "var(--zoned-ink)";
        const durationS = Number(alert.payload["duration_s"] ?? 0);
        const reasons = humanizeReasons(alert.payload["reasons"]);

        const hr = avgAround(timeline, alert.ts, "avgPulseBpm");
        const br = avgAround(timeline, alert.ts, "avgBreathingRpm");

        const overlap = findOverlappingWindow(alert.ts, distractionWindows);
        const appNote = overlap?.appTitle ? ` You were on ${overlap.appTitle} at the time.` : "";

        return (
          <div key={i} style={{ padding: "var(--s5) 0", borderTop: "1px solid var(--line-soft)" }}>
            <div style={{ display: "flex", alignItems: "center", gap: "var(--s2)", flexWrap: "wrap" }}>
              <span style={{ width: 7, height: 7, borderRadius: 2.5, background: color }} />
              <span style={{ fontFamily: "var(--mono)", fontSize: 10.5, color: ink }}>{type}</span>
              <span style={{ fontSize: 11.5, color: "var(--mute)" }}>
                {formatClock(alert.ts)} · sustained {durationS}s
              </span>
            </div>
            <div style={{ marginTop: 10, fontSize: 15, lineHeight: 1.55, color: "var(--ink)", maxWidth: "62ch" }}>
              {reasons ? `Fired after ${reasons}.` : "Fired on sustained physiology thresholds."}
              {appNote}
            </div>
            <div style={{ display: "flex", gap: "var(--s6)", marginTop: "var(--s4)", flexWrap: "wrap", fontVariantNumeric: "tabular-nums" }}>
              <div>
                <div style={{ fontSize: 10.5, fontFamily: "var(--mono)", color: "var(--mute)" }}>HR</div>
                <div style={{ fontSize: 17, fontWeight: 500, letterSpacing: "-0.03em", marginTop: 4 }}>
                  {fmtMeasure(hr.before)} &rarr; {fmtMeasure(hr.after)}
                </div>
              </div>
              <div>
                <div style={{ fontSize: 10.5, fontFamily: "var(--mono)", color: "var(--mute)" }}>breathing /min</div>
                <div style={{ fontSize: 17, fontWeight: 500, letterSpacing: "-0.03em", marginTop: 4 }}>
                  {fmtMeasure(br.before)} &rarr; {fmtMeasure(br.after)}
                </div>
              </div>
            </div>
          </div>
        );
      })}
      <div style={{ paddingTop: "var(--s4)", borderTop: "1px solid var(--line-soft)", fontSize: 11.5, color: "var(--mute)", lineHeight: 1.5 }}>
        All figures are camera-based physiological estimates, not clinical measurements.
      </div>
    </div>
  );
}
