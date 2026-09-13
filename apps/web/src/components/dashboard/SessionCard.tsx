import Link from "next/link";
import type { SessionSummary } from "@/types/api";
import { Card } from "@/components/ui/Card";
import { StateRibbonBar } from "@/components/session-detail/StateRibbonBar";
import { formatDate, formatDuration } from "@/lib/format";

export function SessionCard({ session }: { session: SessionSummary }) {
  return (
    <Link href={`/dashboard/${session.id}`}>
      <Card className="transition-shadow hover:shadow-sm">
        <div className="flex items-center justify-between gap-4">
          <div>
            <div className="text-sm font-medium text-ink">{formatDate(session.startedAt)}</div>
            <div className="mt-0.5 text-xs text-muted">
              {formatDuration(session.durationS)} total · {formatDuration(session.focusTimeS)} focused
            </div>
          </div>
        </div>
        <div className="mt-3">
          <StateRibbonBar segments={session.stateRibbon} />
        </div>
      </Card>
    </Link>
  );
}
