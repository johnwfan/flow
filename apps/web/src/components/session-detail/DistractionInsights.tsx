import type { SessionInsights } from "@/types/api";
import { formatDate } from "@/lib/format";

function formatMinutes(m: number): string {
  return m < 1 ? "<1 min" : `${Math.round(m)} min`;
}

export function DistractionInsights({ insights }: { insights: SessionInsights }) {
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        <div>
          <div className="text-xs uppercase tracking-wide text-muted">Distracted</div>
          <div className="text-xl font-semibold text-ink">{insights.distractionPct}%</div>
        </div>
        <div>
          <div className="text-xs uppercase tracking-wide text-muted">Zone-out episodes</div>
          <div className="text-xl font-semibold text-ink">{insights.zoneOutEpisodes}</div>
        </div>
        <div>
          <div className="text-xs uppercase tracking-wide text-muted">Spiral episodes</div>
          <div className="text-xl font-semibold text-ink">{insights.spiralEpisodes}</div>
        </div>
      </div>

      {insights.distractingApps.length > 0 && (
        <div>
          <h4 className="mb-2 text-sm font-medium text-ink">What distracted you</h4>
          <div className="space-y-1.5">
            {insights.distractingApps.slice(0, 5).map((a, i) => (
              <div key={i} className="flex items-center justify-between text-sm">
                <span className="text-ink">{a.appTitle ?? a.category ?? "unknown"}</span>
                <span className="text-muted">
                  {formatMinutes(a.minutes)} · {a.episodes} episode{a.episodes === 1 ? "" : "s"}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {insights.distractionWindows.length > 0 && (
        <div>
          <h4 className="mb-2 text-sm font-medium text-ink">When it happened</h4>
          <div className="space-y-1 text-sm text-muted">
            {insights.distractionWindows.map((w, i) => (
              <div key={i}>
                {formatDate(w.startedAt)} — {Math.round(w.durationS / 60)} min
                {w.appTitle ? ` while on ${w.appTitle}` : ""}
              </div>
            ))}
          </div>
        </div>
      )}

      {insights.tips && (
        <div className="rounded-lg bg-accent-soft p-4">
          <h4 className="mb-1 text-sm font-medium text-ink">For your next session</h4>
          <p className="text-sm text-ink">{insights.tips}</p>
        </div>
      )}
    </div>
  );
}
