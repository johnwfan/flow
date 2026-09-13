import { State } from "@flow/shared";
import type { ValidationResult } from "@/types/api";
import { NotEnoughData } from "@/components/ui/NotEnoughData";
import { stateLabel } from "@/lib/colors";
import { formatPercent } from "@/lib/format";
import { MIN_PROBES_FOR_VALIDATION } from "@/lib/patterns";

// Rows are what the classifier said (predicted); columns are what you said
// (self-report / actual) -- see computeValidation, which stores the matrix
// keyed the other way round (actual outer, predicted inner), so this reads
// it transposed to match the design's row/column convention.
const PREDICTED_STATES = Object.values(State);

function actualColumns(matrix: ValidationResult["confusionMatrix"]): string[] {
  const found = Object.keys(matrix);
  const canonicalOrder = [...PREDICTED_STATES, "other"];
  const known = canonicalOrder.filter((k) => found.includes(k));
  const extra = found.filter((k) => !canonicalOrder.includes(k));
  const columns = [...known, ...extra];
  return columns.length > 0 ? columns : ["other"];
}

function Stat({ label, value, note }: { label: string; value: string; note: string }) {
  return (
    <div>
      <div style={{ fontSize: 13, color: "var(--mute)" }}>{label}</div>
      <div style={{ fontSize: 26, fontWeight: 500, letterSpacing: "-0.04em", fontVariantNumeric: "tabular-nums", marginTop: 5 }}>
        {value}
      </div>
      <div style={{ fontSize: 13, color: "var(--mute)", marginTop: 4 }}>{note}</div>
    </div>
  );
}

function ValidationStats({ data }: { data: ValidationResult }) {
  return (
    <div
      style={{
        display: "flex",
        gap: "var(--s7)",
        marginTop: "var(--s6)",
        paddingTop: "var(--s4)",
        borderTop: "1px solid var(--line)",
        flexWrap: "wrap",
      }}
    >
      <Stat label="Check-ins" value={`n = ${data.n}`} note={`${data.n} answered`} />
      <Stat label="Agreement" value={formatPercent(data.agreementRate)} note="matched your self-report" />
      <Stat label="False alarms" value={formatPercent(data.falseAlarmRate)} note="called drifting, you were fine" />
    </div>
  );
}

export function ConfusionMatrix({ data, showStats = true }: { data: ValidationResult; showStats?: boolean }) {
  if (data.n < MIN_PROBES_FOR_VALIDATION) {
    return (
      <div>
        <NotEnoughData height={280} have={data.n} need={MIN_PROBES_FOR_VALIDATION} unit="check-ins" />
        {showStats && <ValidationStats data={data} />}
      </div>
    );
  }

  const columns = actualColumns(data.confusionMatrix);
  const maxAgreement = Math.max(1, ...PREDICTED_STATES.map((p) => data.confusionMatrix[p]?.[p] ?? 0));
  const gridCols = `120px repeat(${columns.length}, minmax(0, 1fr))`;
  const matrixWidth = Math.max(520, 120 + columns.length * 104);

  return (
    <div>
      <div style={{ width: matrixWidth }}>
        <div
          style={{
            display: "grid",
            gridTemplateColumns: gridCols,
            gap: "var(--s2)",
            alignItems: "end",
            marginBottom: "var(--s2)",
          }}
        >
          <span />
          {columns.map((c) => (
            <span key={c} style={{ fontSize: 14, color: "var(--body)", textAlign: "center" }}>
              you said {c === "other" ? "other" : stateLabel(c).toLowerCase()}
            </span>
          ))}
        </div>

        {PREDICTED_STATES.map((predicted) => (
          <div
            key={predicted}
            style={{
              display: "grid",
              gridTemplateColumns: gridCols,
              gap: "var(--s2)",
              marginBottom: "var(--s2)",
              alignItems: "stretch",
            }}
          >
            <span style={{ fontFamily: "var(--mono)", fontSize: 12, color: "var(--body)", alignSelf: "center" }}>
              {predicted}
            </span>
            {columns.map((actual) => {
              const count = data.confusionMatrix[actual]?.[predicted] ?? 0;
              const agrees = actual === predicted;
              const alpha = agrees ? 0.12 + (count / maxAgreement) * 0.78 : 0;
              const background = agrees ? `oklch(from var(--deep) l c h / ${alpha.toFixed(2)})` : "var(--sink)";
              const bright = agrees && alpha > 0.6;
              return (
                <span
                  key={actual}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    height: 84,
                    borderRadius: "var(--r-sm)",
                    fontSize: 24,
                    fontWeight: 500,
                    fontVariantNumeric: "tabular-nums",
                    background,
                    color: bright ? "oklch(1 0 0)" : "var(--body)",
                  }}
                >
                  {count || ""}
                </span>
              );
            })}
          </div>
        ))}
      </div>

      {showStats && <ValidationStats data={data} />}
    </div>
  );
}
