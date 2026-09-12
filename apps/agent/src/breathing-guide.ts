import type { BreathingGuideMessage } from "@flow/shared";
import { getThresholds } from "./thresholds.js";

export interface BreathingGuideCallbacks {
  onPhase: (msg: BreathingGuideMessage) => void;
}

/**
 * Paced breathing guide — emits alternating inhale/exhale phase messages
 * timed off the user's own measured breathing rate, nudged toward a
 * calmer inhale:exhale ratio (longer exhale = parasympathetic activation).
 *
 * Runs agent-side so the UI just animates whatever phase/duration it's
 * told, rather than re-deriving timing itself. Rate is re-measured at the
 * start of each cycle, so the guide tracks the user as they naturally slow.
 */
export class BreathingGuideScheduler {
  private timer: ReturnType<typeof setTimeout> | null = null;
  private cyclesRemaining = 0;
  private running = false;
  private getCurrentRpm: () => number;
  private callbacks: BreathingGuideCallbacks;

  constructor(opts: {
    /** Returns the current rolling-average breathing rate (RPM). */
    getCurrentRpm: () => number;
    callbacks: BreathingGuideCallbacks;
  }) {
    this.getCurrentRpm = opts.getCurrentRpm;
    this.callbacks = opts.callbacks;
  }

  get isRunning(): boolean {
    return this.running;
  }

  /** Start (or restart) a guided breathing sequence. */
  start(): void {
    const th = getThresholds().breathing_guide;
    this.stop();
    this.running = true;
    this.cyclesRemaining = th.cycles;
    this.runPhase("inhale");
  }

  stop(): void {
    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = null;
    }
    this.running = false;
  }

  private runPhase(phase: "inhale" | "exhale"): void {
    if (!this.running) return;

    const th = getThresholds().breathing_guide;
    // Fall back to a typical resting rate if we have no measurement yet
    // (e.g. guide triggered before enough breathing samples arrived).
    const rpm = this.getCurrentRpm() || th.fallback_rpm;
    const cycleMs = (60 / rpm) * 1000;
    const ieRatio = th.ie_ratio;

    // ie_ratio = exhale/inhale. inhale + exhale = cycleMs.
    const inhaleMs = cycleMs / (1 + ieRatio);
    const exhaleMs = cycleMs - inhaleMs;
    const durationMs = Math.round(phase === "inhale" ? inhaleMs : exhaleMs);

    this.callbacks.onPhase({
      kind: "breathing_guide",
      phase,
      duration_ms: durationMs,
      measured_rpm: rpm,
      ie_ratio: ieRatio,
    });

    if (phase === "exhale") {
      this.cyclesRemaining--;
      if (this.cyclesRemaining <= 0) {
        this.stop();
        return;
      }
    }

    const nextPhase = phase === "inhale" ? "exhale" : "inhale";
    this.timer = setTimeout(() => this.runPhase(nextPhase), durationMs);
  }
}
