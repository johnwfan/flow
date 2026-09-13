import type { EventRow } from "@/types/api";
import { stateLabel } from "@/lib/colors";
import { formatDate } from "@/lib/format";

export function ProbeComparisonTable({ probes }: { probes: EventRow[] }) {
  if (probes.length === 0) {
    return <p className="text-sm text-muted">No thought probes were answered this session.</p>;
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-left text-sm">
        <thead>
          <tr className="border-b border-border text-xs uppercase tracking-wide text-muted">
            <th className="py-2 pr-4 font-medium">Time</th>
            <th className="py-2 pr-4 font-medium">Classifier said</th>
            <th className="py-2 font-medium">You said</th>
          </tr>
        </thead>
        <tbody>
          {probes.map((probe, i) => {
            const classifierState = String(probe.payload["classifier_state"] ?? "—");
            const userResponse = probe.payload["user_response"] as string | null;
            const agrees = userResponse === classifierState;

            return (
              <tr key={i} className="border-b border-border/60 last:border-0">
                <td className="py-2 pr-4 text-muted">{formatDate(probe.ts)}</td>
                <td className="py-2 pr-4 text-ink">{stateLabel(classifierState)}</td>
                <td className={`py-2 ${agrees ? "text-ink" : "text-accent"}`}>
                  {userResponse ? stateLabel(userResponse) : "no response"}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
