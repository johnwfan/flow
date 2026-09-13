import type { SessionSummary } from "@/types/api";
import { SessionCard } from "@/components/dashboard/SessionCard";
import { EmptyState } from "@/components/dashboard/EmptyState";

export function SessionList({ sessions }: { sessions: SessionSummary[] }) {
  if (sessions.length === 0) return <EmptyState />;

  return (
    <div className="space-y-3">
      {sessions.map((session) => (
        <SessionCard key={session.id} session={session} />
      ))}
    </div>
  );
}
