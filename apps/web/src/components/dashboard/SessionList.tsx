import type { SessionSummary } from "@/types/api";
import { SessionCard } from "@/components/dashboard/SessionCard";

/** Assumes a non-empty list — the caller renders the "Empty history" edge state instead. */
export function SessionList({ sessions }: { sessions: SessionSummary[] }) {
  return (
    <div>
      <div
        style={{
          display: "flex",
          gap: "var(--s5)",
          paddingBottom: "var(--s3)",
          fontSize: 10.5,
          fontFamily: "var(--mono)",
          color: "var(--mute)",
        }}
      >
        <span style={{ flex: 1 }}>session</span>
        <span style={{ width: 110, textAlign: "right" }}>duration</span>
      </div>
      {sessions.map((session) => (
        <SessionCard key={session.id} session={session} />
      ))}
      <div style={{ borderTop: "1px solid var(--line-soft)" }} />
    </div>
  );
}
