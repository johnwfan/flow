import type { CSSProperties } from "react";
import type { BreakQuality, InterventionEfficacyPoint } from "@/types/api";
import { formatDate } from "@/lib/format";

const labelStyle: CSSProperties = { fontSize: 11.5, color: "var(--mute)", marginBottom: "var(--s3)" };
const captionStyle: CSSProperties = {
  marginTop: "var(--s3)",
  fontSize: 12.5,
  color: "var(--body)",
  lineHeight: 1.55,
  maxWidth: "40ch",
};
const rowStyle: CSSProperties = {
  padding: "11px 0",
  borderTop: "1px solid var(--line-soft)",
  display: "flex",
  alignItems: "center",
  gap: "var(--s3)",
};

function BreakRow({ color, label, value }: { color: string; label: string; value: string }) {
  return (
    <div style={rowStyle}>
      <span style={{ width: 7, height: 7, borderRadius: 2.5, background: color, flex: "none" }} />
      <span style={{ flex: 1, fontSize: 13, color: "var(--ink)" }}>{label}</span>
      <span style={{ fontSize: 13, fontVariantNumeric: "tabular-nums" }}>{value}</span>
    </div>
  );
}

function EfficacyRow({ label, value }: { label: string; value: string }) {
  return (
    <div style={{ padding: "11px 0", borderTop: "1px solid var(--line-soft)" }}>
      <div style={{ fontFamily: "var(--mono)", fontSize: 10.5, color: "var(--mute)" }}>{label}</div>
      <div style={{ marginTop: 5, fontSize: 17, fontWeight: 500, letterSpacing: "-0.03em", fontVariantNumeric: "tabular-nums" }}>
        {value}
      </div>
    </div>
  );
}

function average(values: number[]): number {
  return values.length === 0 ? 0 : values.reduce((sum, v) => sum + v, 0) / values.length;
}

export function BreaksAndInterventions({
  breakQuality,
  interventionEfficacy,
}: {
  breakQuality: BreakQuality;
  interventionEfficacy: InterventionEfficacyPoint[];
}) {
  const totalBreaks = breakQuality.restorative + breakQuality.depleting;
  const validEfficacy = interventionEfficacy.filter(
    (e): e is { ts: string; breathingRpmBefore: number; breathingRpmAfter: number } =>
      e.breathingRpmBefore !== null && e.breathingRpmAfter !== null,
  );

  return (
    <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))", gap: "var(--s7)" }}>
      <div>
        <div style={labelStyle}>Break quality</div>
        {totalBreaks === 0 ? (
          <p style={{ fontSize: 13, color: "var(--mute)" }}>No pause/resume breaks recorded yet.</p>
        ) : (
          <>
            <BreakRow color="var(--break)" label="Restorative" value={`${breakQuality.restorative} of ${totalBreaks}`} />
            <BreakRow color="var(--zoned)" label="Depleting" value={`${breakQuality.depleting} of ${totalBreaks}`} />
            <p style={captionStyle}>
              Restorative means you were back in deep work within three minutes of resuming a pause.
            </p>
          </>
        )}
      </div>

      <div>
        <div style={labelStyle}>Breathing loop, before &rarr; after</div>
        {validEfficacy.length === 0 ? (
          <p style={{ fontSize: 13, color: "var(--mute)" }}>No interventions recorded yet.</p>
        ) : (
          <>
            <EfficacyRow
              label="breathing /min, average"
              value={`${average(validEfficacy.map((e) => e.breathingRpmBefore)).toFixed(1)} → ${average(
                validEfficacy.map((e) => e.breathingRpmAfter),
              ).toFixed(1)}`}
            />
            {validEfficacy.slice(0, 3).map((e, i) => (
              <EfficacyRow
                key={i}
                label={formatDate(e.ts)}
                value={`${e.breathingRpmBefore.toFixed(1)} → ${e.breathingRpmAfter.toFixed(1)} rpm`}
              />
            ))}
            <p style={captionStyle}>
              Across {interventionEfficacy.length} alert{interventionEfficacy.length === 1 ? "" : "s"} triggered.
              Breathing rate measured two minutes before and after each one.
            </p>
          </>
        )}
      </div>
    </div>
  );
}
