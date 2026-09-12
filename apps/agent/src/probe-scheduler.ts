import { State } from "@flow/shared";
import type { ThoughtProbeMessage } from "@flow/shared";

/**
 * Schedules thought probes at jittered 8-12 minute intervals.
 * Suppressed during warmup, during active alerts, and for 2 minutes
 * after an alert dismissal.
 */
export class ProbeScheduler {
  private timer: ReturnType<typeof setTimeout> | null = null;
  private suppressedUntil = 0;
  private probeCount = 0;
  private onProbe: (msg: ThoughtProbeMessage) => void;
  private getClassifierState: () => State;

  constructor(opts: {
    onProbe: (msg: ThoughtProbeMessage) => void;
    getClassifierState: () => State;
  }) {
    this.onProbe = opts.onProbe;
    this.getClassifierState = opts.getClassifierState;
  }

  /** Start scheduling probes */
  start(): void {
    this.scheduleNext();
    console.log("[probes] scheduler started");
  }

  stop(): void {
    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = null;
    }
    console.log(`[probes] scheduler stopped (${this.probeCount} probes fired)`);
  }

  /** Suppress probes for a duration (e.g., during/after alerts) */
  suppress(durationMs: number): void {
    this.suppressedUntil = Date.now() + durationMs;
  }

  /** Suppress for 2 minutes (post-alert) */
  suppressPostAlert(): void {
    this.suppress(2 * 60 * 1000);
  }

  private scheduleNext(): void {
    // Jittered interval: 8-12 minutes
    const minMs = 8 * 60 * 1000;
    const maxMs = 12 * 60 * 1000;
    const delay = minMs + Math.random() * (maxMs - minMs);

    this.timer = setTimeout(() => {
      this.fire();
    }, delay);
  }

  private fire(): void {
    const now = Date.now();
    const classifierState = this.getClassifierState();

    // Check suppression
    if (now < this.suppressedUntil) {
      console.log("[probes] suppressed — rescheduling");
      this.scheduleNext();
      return;
    }

    // Don't probe during warmup or no-signal
    if (classifierState === State.Warmup || classifierState === State.NoSignal) {
      console.log(`[probes] skipped (state=${classifierState}) — rescheduling`);
      this.scheduleNext();
      return;
    }

    // Don't probe during active alerts (ZonedOut or Spiraling)
    if (
      classifierState === State.ZonedOut ||
      classifierState === State.Spiraling
    ) {
      console.log(`[probes] suppressed during alert (state=${classifierState})`);
      this.scheduleNext();
      return;
    }

    this.probeCount++;
    console.log(
      `[probes] firing probe #${this.probeCount} (classifier_state=${classifierState})`
    );

    this.onProbe({
      kind: "thought_probe",
      ts: now,
      classifier_state: classifierState,
      user_response: null, // filled by client response
    });

    // Schedule next
    this.scheduleNext();
  }
}
