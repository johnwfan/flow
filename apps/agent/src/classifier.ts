import { State, DetectionStatus, Category } from "@flow/shared";
import type { SampleMessage, StateMessage, AlertMessage } from "@flow/shared";
import type { BaselineStats } from "./baseline.js";
import { getThresholds } from "./thresholds.js";
import { RingBuffer } from "./ring-buffer.js";

export interface ClassifierCallbacks {
  onStateChange: (msg: StateMessage) => void;
  onAlert: (msg: AlertMessage) => void;
}

/**
 * 1Hz classifier that evaluates physiological state from buffered samples.
 *
 * Zone-out rule: blink-rate-change (derived > baseline*1.4) + head stillness
 * + HRV/EDA arousal drop + study app context + not-talking, sustained 90s.
 *
 * Spiral rule: arousal climbing (elevated HR, high breathing, reduced HRV,
 * increased EDA), sustained 30s.
 */
export class Classifier {
  private interval: ReturnType<typeof setInterval> | null = null;
  private currentState = State.Focused;
  private stateEnteredAt = 0;
  private lastTransitionAt = 0;
  private currentCategory: Category = Category.Unknown;

  // Blink rate derivation
  private blinkTransitions = 0;
  private lastBlinkStatus: DetectionStatus | null = null;
  private blinkWindowStart = 0;
  private derivedBlinkRate = 0;

  // Recent samples for windowed analysis
  private recentSamples = new RingBuffer<SampleMessage>(200); // ~10s at 20Hz

  // How long confidence has been continuously below threshold -- see the
  // debounce in evaluate(). null while confidence is fine.
  private lowConfidenceSince: number | null = null;

  constructor(
    private baseline: BaselineStats,
    private callbacks: ClassifierCallbacks
  ) {}

  /** Feed a sample into the classifier's buffer */
  addSample(sample: SampleMessage): void {
    this.recentSamples.push(sample);
    this.updateBlinkRate(sample);
  }

  /** Update the current app category (from window tracker) */
  setCategory(category: Category): void {
    this.currentCategory = category;
  }

  /** Start 1Hz evaluation loop */
  start(): void {
    if (this.interval) return;
    this.stateEnteredAt = Date.now();
    this.lastTransitionAt = Date.now();

    const th = getThresholds();
    this.interval = setInterval(() => {
      this.evaluate();
    }, th.classifier.eval_interval_ms);

    console.log("[classifier] started (1Hz evaluation)");
  }

  stop(): void {
    if (this.interval) {
      clearInterval(this.interval);
      this.interval = null;
      console.log("[classifier] stopped");
    }
  }

  get state(): State {
    return this.currentState;
  }

  private evaluate(): void {
    const th = getThresholds();
    const now = Date.now();
    const samples = this.recentSamples.last(100); // last ~5s

    if (samples.length < 20) return; // need minimum data

    // Check confidence — sustained low confidence means NoSignal. A brief
    // dip (motion, a CPU hiccup on the machine also running the browser
    // dashboard) is common and isn't the same as actually losing tracking
    // -- the SDK's own per-frame framing feedback keeps working through
    // it, so flipping the whole displayed state on the very first low
    // tick was confusing ("it said lost signal but the webcam was still
    // clearly tracking me"). Require it to persist before believing it.
    const avgConf = avg(samples.map((s) => s.conf).filter(notNull));
    if (avgConf < th.classifier.confidence_threshold) {
      if (this.lowConfidenceSince == null) this.lowConfidenceSince = now;
      const debounceMs = (th.classifier.no_signal_debounce_s ?? 4) * 1000;
      if (now - this.lowConfidenceSince >= debounceMs) {
        this.transitionTo(State.NoSignal, ["low_confidence"], now, th);
      }
      return;
    }
    this.lowConfidenceSince = null;

    // Compute current metrics
    const avgHrv = avg(samples.map((s) => s.hrv_ms).filter(notNull));
    const avgPulse = avg(samples.map((s) => s.pulse_bpm).filter(notNull));
    const avgBreathing = avg(samples.map((s) => s.breathing_rpm).filter(notNull));
    const avgEda = avg(samples.map((s) => s.eda_us).filter(notNull));
    const isTalking = samples.some(
      (s) => s.talking === DetectionStatus.Detected
    );

    // Check zone-out conditions
    const zoneOutReasons = this.checkZoneOut(
      avgHrv, avgEda, isTalking, th, samples
    );

    // Check spiral conditions
    const spiralReasons = this.checkSpiral(
      avgPulse, avgBreathing, avgHrv, avgEda, th
    );

    if (zoneOutReasons.length > 0) {
      const sustained = this.currentState === State.ZonedOut;
      const sustainedMs = sustained ? now - this.stateEnteredAt : 0;

      if (!sustained) {
        this.transitionTo(State.ZonedOut, zoneOutReasons, now, th);
      } else if (sustainedMs >= th.zone_out.sustain_s * 1000) {
        // Fire alert after sustained period
        this.callbacks.onAlert({
          kind: "alert",
          type: "zone_out",
          reasons: zoneOutReasons,
          ts: now,
          duration_s: Math.round(sustainedMs / 1000),
        });
        // Reset sustain timer after firing
        this.stateEnteredAt = now;
      }
    } else if (spiralReasons.length > 0) {
      const sustained = this.currentState === State.Spiraling;
      const sustainedMs = sustained ? now - this.stateEnteredAt : 0;

      if (!sustained) {
        this.transitionTo(State.Spiraling, spiralReasons, now, th);
      } else if (sustainedMs >= th.spiral.sustain_s * 1000) {
        this.callbacks.onAlert({
          kind: "alert",
          type: "spiral",
          reasons: spiralReasons,
          ts: now,
          duration_s: Math.round(sustainedMs / 1000),
        });
        this.stateEnteredAt = now;
      }
    } else if (
      this.currentState !== State.Focused &&
      now - this.lastTransitionAt > th.classifier.hysteresis_s * 1000
    ) {
      this.transitionTo(State.Focused, ["signals_normal"], now, th);
    }
  }

  private checkZoneOut(
    avgHrv: number,
    avgEda: number,
    isTalking: boolean,
    th: ReturnType<typeof getThresholds>,
    samples: SampleMessage[]
  ): string[] {
    const reasons: string[] = [];
    const zo = th.zone_out;

    // Blink rate change
    if (this.derivedBlinkRate > this.baseline.blinkRate * zo.blink_rate_multiplier) {
      reasons.push("elevated_blink_rate");
    }

    // Head stillness (low landmark variance)
    if (this.isHeadStill(samples, zo.head_stillness_variance_max)) {
      reasons.push("head_stillness");
    }

    // HRV/EDA arousal drop
    if (avgHrv > 0 && avgHrv < this.baseline.hrv * (1 - zo.hrv_drop_fraction)) {
      reasons.push("hrv_drop");
    }
    if (avgEda > 0 && avgEda < this.baseline.eda * (1 - zo.eda_drop_fraction)) {
      reasons.push("eda_drop");
    }

    // Context checks
    if (zo.require_study_context) {
      const isStudy =
        this.currentCategory === Category.Study ||
        this.currentCategory === Category.Productivity;
      if (!isStudy) return []; // not in study context, can't be zoned out
    }

    if (zo.require_not_talking && isTalking) {
      return []; // talking means engaged
    }

    // Need at least 2 physiological signals for zone-out
    return reasons.length >= 2 ? reasons : [];
  }

  private checkSpiral(
    avgPulse: number,
    avgBreathing: number,
    avgHrv: number,
    avgEda: number,
    th: ReturnType<typeof getThresholds>
  ): string[] {
    const reasons: string[] = [];
    const sp = th.spiral;

    if (avgPulse > this.baseline.pulse + sp.hr_elevation_bpm) {
      reasons.push("elevated_heart_rate");
    }
    if (avgBreathing > sp.breathing_high_rpm) {
      reasons.push("high_breathing_rate");
    }
    if (avgHrv > 0 && avgHrv < this.baseline.hrv * (1 - sp.hrv_drop_fraction)) {
      reasons.push("reduced_hrv");
    }
    if (avgEda > 0 && avgEda > this.baseline.eda * (1 + sp.eda_rise_fraction)) {
      reasons.push("increased_eda");
    }

    // High breathing alone is actionable enough for the breathing-loop
    // notification; other spiral evidence still needs two signals.
    return reasons.includes("high_breathing_rate") || reasons.length >= 2 ? reasons : [];
  }

  private isHeadStill(
    samples: SampleMessage[],
    varianceMax: number
  ): boolean {
    // Use landmark centroid if available
    const centroids: [number, number][] = [];
    for (const s of samples) {
      if (s.landmarks && s.landmarks.length > 0) {
        let cx = 0, cy = 0;
        for (const [x, y] of s.landmarks) {
          cx += x;
          cy += y;
        }
        cx /= s.landmarks.length;
        cy /= s.landmarks.length;
        centroids.push([cx, cy]);
      }
    }

    if (centroids.length < 10) return false; // not enough data

    const xVar = variance(centroids.map(([x]) => x));
    const yVar = variance(centroids.map(([, y]) => y));
    return (xVar + yVar) / 2 < varianceMax;
  }

  private updateBlinkRate(sample: SampleMessage): void {
    if (sample.blink == null) return;

    if (this.blinkWindowStart === 0) this.blinkWindowStart = sample.ts;

    if (
      this.lastBlinkStatus === DetectionStatus.Detected &&
      sample.blink === DetectionStatus.NotDetected
    ) {
      this.blinkTransitions++;
    }
    this.lastBlinkStatus = sample.blink;

    // Compute rate every 30 seconds
    const elapsed = (sample.ts - this.blinkWindowStart) / 1000;
    if (elapsed >= 30) {
      this.derivedBlinkRate = (this.blinkTransitions / elapsed) * 60;
      this.blinkTransitions = 0;
      this.blinkWindowStart = sample.ts;
    }
  }

  private transitionTo(
    newState: State,
    reasons: string[],
    now: number,
    _th: ReturnType<typeof getThresholds>
  ): void {
    if (newState === this.currentState) return;

    const prevState = this.currentState;
    this.currentState = newState;
    this.stateEnteredAt = now;
    this.lastTransitionAt = now;

    console.log(
      `[classifier] ${prevState} → ${newState} (${reasons.join(", ")})`
    );

    this.callbacks.onStateChange({
      kind: "state",
      state: newState,
      reasons,
      confidence: 0.8,
      ts: now,
    });
  }
}

function notNull<T>(val: T | null | undefined): val is T {
  return val != null;
}

function avg(arr: number[]): number {
  if (arr.length === 0) return 0;
  return arr.reduce((a, b) => a + b, 0) / arr.length;
}

function variance(arr: number[]): number {
  if (arr.length < 2) return 0;
  const m = avg(arr);
  return arr.reduce((sum, x) => sum + (x - m) ** 2, 0) / (arr.length - 1);
}
