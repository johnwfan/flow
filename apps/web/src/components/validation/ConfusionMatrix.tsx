import { State } from "@flow/shared";
import type { ValidationResult } from "@/types/api";
import { Card } from "@/components/ui/Card";
import { StatTile } from "@/components/ui/StatTile";
import { stateLabel } from "@/lib/colors";
import { formatPercent } from "@/lib/format";

const BLUE_RAMP = ["#fcfcfb", "#cde2fb", "#9ec5f4", "#6da7ec", "#3987e5", "#1c5cab", "#0d366b"];

function rampColor(value: number, max: number): string {
  if (max === 0) return BLUE_RAMP[0]!;
  const step = Math.min(BLUE_RAMP.length - 1, Math.round((value / max) * (BLUE_RAMP.length - 1)));
  return BLUE_RAMP[step]!;
}

export function ConfusionMatrix({ data }: { data: ValidationResult }) {
  const predictedStates = Object.values(State);
  const actualLabels = [...new Set([...Object.keys(data.confusionMatrix), ...predictedStates])];

  const max = Math.max(1, ...Object.values(data.confusionMatrix).flatMap((row) => Object.values(row)));

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-3 gap-3">
        <StatTile label="Probes answered" value={String(data.n)} />
        <StatTile label="Agreement rate" value={formatPercent(data.agreementRate)} />
        <StatTile label="False-alarm rate" value={formatPercent(data.falseAlarmRate)} />
      </div>

      {data.n === 0 ? (
        <p className="text-sm text-muted">No thought-probe responses recorded yet.</p>
      ) : (
        <Card>
          <div className="overflow-x-auto">
            <table className="border-separate border-spacing-1 text-xs">
              <thead>
                <tr>
                  <th className="p-1 text-right font-medium text-muted">actual \ predicted</th>
                  {predictedStates.map((p) => (
                    <th key={p} className="p-1 text-center font-medium text-muted">
                      {stateLabel(p)}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {actualLabels.map((actual) => (
                  <tr key={actual}>
                    <th className="p-1 text-right font-medium text-muted">
                      {actual === "other" ? "Other" : stateLabel(actual)}
                    </th>
                    {predictedStates.map((predicted) => {
                      const count = data.confusionMatrix[actual]?.[predicted] ?? 0;
                      return (
                        <td
                          key={predicted}
                          className="h-10 w-10 rounded text-center align-middle font-medium"
                          style={{
                            backgroundColor: rampColor(count, max),
                            color: count / max > 0.5 ? "#fcfcfb" : "#0b0b0b",
                          }}
                        >
                          {count || ""}
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}
    </div>
  );
}
