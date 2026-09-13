import type { EventRow } from "@/types/api";
import { formatClock } from "@/lib/format";
import { isFalseAlarm } from "@/lib/sessionMetrics";

interface Row {
  time: string;
  said: string;
  predicted: string;
  verdict: string;
  color: string;
}

function buildRows(probes: EventRow[]): Row[] {
  return probes.map((probe) => {
    const predicted = String(probe.payload["classifier_state"] ?? "—");
    const userResponse = probe.payload["user_response"];
    const said = typeof userResponse === "string" && userResponse ? userResponse.replace(/_/g, " ") : null;

    if (!said) return { time: formatClock(probe.ts), said: "no response", predicted, verdict: "no response", color: "var(--mute)" };
    if (userResponse === predicted) {
      return { time: formatClock(probe.ts), said, predicted, verdict: "agreed", color: "var(--mute)" };
    }
    if (isFalseAlarm(predicted, userResponse as string)) {
      return { time: formatClock(probe.ts), said, predicted, verdict: "false alarm", color: "var(--spiral-ink)" };
    }
    return { time: formatClock(probe.ts), said, predicted, verdict: "disagreed", color: "var(--body)" };
  });
}

/** "Check-ins": probe answers vs. the classifier's read at that moment, as a hairline list. */
export function CheckInsList({ probes }: { probes: EventRow[] }) {
  if (probes.length === 0) {
    return <p style={{ fontSize: 13, color: "var(--mute)" }}>No check-ins were answered this session.</p>;
  }

  const rows = buildRows(probes);
  const answered = rows.filter((r) => r.verdict !== "no response");
  const agreeCount = answered.filter((r) => r.verdict === "agreed").length;
  const falseAlarmCount = rows.filter((r) => r.verdict === "false alarm").length;

  return (
    <div>
      {rows.map((row, i) => (
        <div
          key={i}
          style={{
            display: "grid",
            gridTemplateColumns: "62px 90px 22px minmax(0, 1fr) 86px",
            gap: "var(--s3)",
            alignItems: "center",
            padding: "11px 0",
            borderTop: "1px solid var(--line-soft)",
            fontSize: 12.5,
          }}
        >
          <span style={{ fontVariantNumeric: "tabular-nums", color: "var(--mute)" }}>{row.time}</span>
          <span style={{ color: "var(--ink)", textTransform: "capitalize" }}>{row.said}</span>
          <span style={{ color: "var(--tick)" }}>&rarr;</span>
          <span style={{ fontFamily: "var(--mono)", fontSize: 10.5, color: "var(--body)" }}>{row.predicted}</span>
          <span style={{ textAlign: "right", fontSize: 11.5, color: row.color }}>{row.verdict}</span>
        </div>
      ))}

      <div style={{ display: "flex", gap: "var(--s7)", marginTop: "var(--s5)", paddingTop: "var(--s4)", borderTop: "1px solid var(--line)" }}>
        <div>
          <div style={{ fontSize: 11.5, color: "var(--mute)" }}>Agreement</div>
          <div style={{ fontSize: 23, fontWeight: 500, letterSpacing: "-0.04em", fontVariantNumeric: "tabular-nums", marginTop: 4 }}>
            {answered.length > 0 ? `${agreeCount} of ${answered.length}` : "—"}
          </div>
        </div>
        <div>
          <div style={{ fontSize: 11.5, color: "var(--mute)" }}>Check-ins</div>
          <div style={{ fontSize: 23, fontWeight: 500, letterSpacing: "-0.04em", fontVariantNumeric: "tabular-nums", marginTop: 4 }}>
            {rows.length}
          </div>
        </div>
        <div>
          <div style={{ fontSize: 11.5, color: "var(--mute)" }}>False alarms</div>
          <div style={{ fontSize: 23, fontWeight: 500, letterSpacing: "-0.04em", fontVariantNumeric: "tabular-nums", marginTop: 4 }}>
            {falseAlarmCount}
          </div>
        </div>
      </div>
    </div>
  );
}
