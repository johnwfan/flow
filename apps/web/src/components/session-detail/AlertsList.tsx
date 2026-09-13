import type { EventRow } from "@/types/api";
import { status } from "@/lib/colors";
import { formatDate } from "@/lib/format";

export function AlertsList({ alerts }: { alerts: EventRow[] }) {
  if (alerts.length === 0) {
    return <p className="text-sm text-muted">No alerts fired during this session.</p>;
  }

  return (
    <ul className="space-y-2">
      {alerts.map((alert, i) => {
        const type = String(alert.payload["type"] ?? "alert");
        const reasons = Array.isArray(alert.payload["reasons"]) ? (alert.payload["reasons"] as string[]) : [];
        const durationS = Number(alert.payload["duration_s"] ?? 0);

        return (
          <li key={i} className="flex items-start gap-3 rounded-lg border border-border px-3 py-2">
            <span
              className="mt-1.5 h-2 w-2 shrink-0 rounded-full"
              style={{ backgroundColor: type === "spiral" ? status.critical : status.warning }}
            />
            <div>
              <div className="text-sm font-medium text-ink">
                {type === "spiral" ? "Spiral" : "Zone-out"} · {formatDate(alert.ts)}
              </div>
              <div className="text-xs text-muted">
                {Math.round(durationS)}s{reasons.length > 0 ? ` — ${reasons.join(", ")}` : ""}
              </div>
            </div>
          </li>
        );
      })}
    </ul>
  );
}
