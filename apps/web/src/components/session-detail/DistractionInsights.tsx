import type { SessionInsights } from "@/types/api";
import { formatClock, formatMinutesLabel } from "@/lib/format";
import { categoryVar } from "@/lib/stateVisuals";
import { StatFigure } from "@/components/ui/StatFigure";

/**
 * Placement (a) of the AI distraction insights — see task spec: three
 * tabular stats, a Bars-chart ranking of distracting apps, a hairline
 * "when it happened" list, and the Gemini tips as a rule-accented callout.
 */
export function DistractionInsights({ insights }: { insights: SessionInsights }) {
  const apps = insights.distractingApps.slice(0, 6);
  const maxMinutes = Math.max(...apps.map((a) => a.minutes), 1);

  return (
    <div>
      <div style={{ display: "flex", gap: "var(--s7)", flexWrap: "wrap" }}>
        <StatFigure label="Distracted" value={`${Math.round(insights.distractionPct)}%`} color="var(--zoned-ink)" />
        <StatFigure label="Zone-out episodes" value={String(insights.zoneOutEpisodes)} />
        <StatFigure label="Spiral episodes" value={String(insights.spiralEpisodes)} color="var(--spiral-ink)" />
      </div>

      {apps.length > 0 && (
        <div style={{ marginTop: "var(--s5)" }}>
          {apps.map((a, i) => {
            const label = a.appTitle ?? (a.category ? a.category : "unknown");
            const pct = Math.max(4, Math.round((a.minutes / maxMinutes) * 100));
            return (
              <div
                key={i}
                style={{
                  display: "grid",
                  gridTemplateColumns: "minmax(80px, 140px) minmax(0, 1fr) 84px",
                  gap: "var(--s3)",
                  alignItems: "center",
                  padding: "9px 0",
                }}
              >
                <span
                  style={{
                    fontSize: 12.5,
                    color: "var(--body)",
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                    whiteSpace: "nowrap",
                  }}
                >
                  {label}
                </span>
                <span
                  style={{
                    height: 10,
                    borderRadius: "var(--r-pill)",
                    background: "var(--sink)",
                    display: "block",
                    overflow: "hidden",
                  }}
                >
                  <span
                    style={{
                      display: "block",
                      height: "100%",
                      width: `${pct}%`,
                      borderRadius: "var(--r-pill)",
                      background: categoryVar(a.category),
                    }}
                  />
                </span>
                <span style={{ textAlign: "right", fontSize: 12.5, fontVariantNumeric: "tabular-nums" }}>
                  {formatMinutesLabel(a.minutes * 60)} · {a.episodes} ep
                </span>
              </div>
            );
          })}
        </div>
      )}

      {insights.distractionWindows.length > 0 && (
        <div style={{ marginTop: "var(--s5)" }}>
          {insights.distractionWindows.map((w, i) => (
            <div
              key={i}
              style={{
                display: "grid",
                gridTemplateColumns: "62px 70px minmax(0, 1fr)",
                gap: "var(--s3)",
                padding: "8px 0",
                borderTop: "1px solid var(--line-soft)",
                fontSize: 12.5,
              }}
            >
              <span style={{ fontVariantNumeric: "tabular-nums", color: "var(--mute)" }}>
                {formatClock(w.startedAt)}
              </span>
              <span style={{ fontVariantNumeric: "tabular-nums", color: "var(--body)" }}>
                {formatMinutesLabel(w.durationS)}
              </span>
              <span style={{ color: "var(--ink)" }}>{w.appTitle ?? w.category ?? "unknown app"}</span>
            </div>
          ))}
        </div>
      )}

      {insights.tips && (
        <div style={{ marginTop: "var(--s5)", borderTop: "2px solid var(--deep)", paddingTop: "var(--s4)" }}>
          <div style={{ fontFamily: "var(--mono)", fontSize: 10.5, color: "var(--mute)" }}>written for you</div>
          <div style={{ marginTop: 8, fontSize: 15, lineHeight: 1.55, color: "var(--ink)", maxWidth: "62ch" }}>
            {insights.tips}
          </div>
        </div>
      )}
    </div>
  );
}
