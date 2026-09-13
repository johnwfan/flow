import Link from "next/link";
import type { SessionSummary } from "@/types/api";
import { State } from "@flow/shared";
import { StateRibbonBar } from "@/components/session-detail/StateRibbonBar";
import { formatClock, formatHM, sessionTitle } from "@/lib/format";
import { deepPct, settleSeconds } from "@/lib/sessionMetrics";
import styles from "./SessionCard.module.css";

function driftCount(session: SessionSummary): number {
  return session.stateRibbon.filter((s) => s.state === State.ZonedOut || s.state === State.Spiraling).length;
}

/** A row, not a card — see design README "Session card". */
export function SessionCard({ session }: { session: SessionSummary }) {
  const settle = settleSeconds(session.stateRibbon);
  const drifts = driftCount(session);
  const pct = deepPct(session.focusTimeS, session.durationS);

  const metaParts = [
    settle !== null ? `settled in ${Math.max(1, Math.round(settle / 60))} m` : null,
    `${drifts} drift${drifts === 1 ? "" : "s"}`,
  ].filter(Boolean);

  return (
    <Link href={`/dashboard/${session.id}`} className={styles.row}>
      <div style={{ minWidth: 0 }}>
        <div style={{ display: "flex", alignItems: "baseline", gap: "var(--s3)", flexWrap: "wrap" }}>
          <span style={{ fontSize: 18, fontWeight: 600, letterSpacing: "-0.025em" }}>{sessionTitle(session.startedAt)}</span>
          <span style={{ fontSize: 12, color: "var(--mute)" }}>
            {formatClock(session.startedAt)}
            {session.endedAt ? `–${formatClock(session.endedAt)}` : ""}
          </span>
        </div>
        <div style={{ marginTop: 11, maxWidth: 520 }}>
          <StateRibbonBar segments={session.stateRibbon} height={7} />
        </div>
        <div style={{ marginTop: 10, fontSize: 12, color: "var(--mute)" }}>{metaParts.join(" · ")}</div>
      </div>
      <div style={{ textAlign: "right" }}>
        <div style={{ fontSize: 24, fontWeight: 500, letterSpacing: "-0.04em", fontVariantNumeric: "tabular-nums" }}>
          {formatHM(session.durationS)}
        </div>
        <div style={{ fontSize: 10.5, color: "var(--mute)", marginTop: 3, fontVariantNumeric: "tabular-nums" }}>
          {pct !== null ? `${pct}% deep` : "—"}
        </div>
      </div>
    </Link>
  );
}
