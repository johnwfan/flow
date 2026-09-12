import type { SampleMessage } from "@flow/shared";
import { DetectionStatus } from "@flow/shared";

export interface BaselineStats {
  /** Mean blink events per minute (derived from binary DetectionStatus) */
  blinkRate: number;
  blinkRateSd: number;
  /** Mean HRV in ms */
  hrv: number;
  hrvSd: number;
  /** Mean breathing rate in RPM */
  breathingRate: number;
  breathingRateSd: number;
  /** Mean EDA in µS */
  eda: number;
  edaSd: number;
  /** Mean pulse in BPM */
  pulse: number;
  pulseSd: number;
  /** Number of samples used */
  sampleCount: number;
  /** Timestamp when baseline was frozen */
  frozenAt: number;
}

/**
 * Collects samples during warmup and computes baseline statistics.
 * Blink rate is derived from binary DetectionStatus transitions.
 */
export class BaselineCollector {
  private pulses: number[] = [];
  private hrvs: number[] = [];
  private breathingRates: number[] = [];
  private edas: number[] = [];

  // Blink rate derivation: count Detected→NotDetected transitions per minute
  private blinkTransitions = 0;
  private lastBlinkStatus: DetectionStatus | null = null;
  private blinkWindowStart = 0;
  private blinkRates: number[] = [];

  private frozen: BaselineStats | null = null;

  addSample(sample: SampleMessage): void {
    if (this.frozen) return;

    if (sample.pulse_bpm != null) this.pulses.push(sample.pulse_bpm);
    if (sample.hrv_ms != null) this.hrvs.push(sample.hrv_ms);
    if (sample.breathing_rpm != null) this.breathingRates.push(sample.breathing_rpm);
    if (sample.eda_us != null) this.edas.push(sample.eda_us);

    // Derive blink rate from binary DetectionStatus
    if (sample.blink != null) {
      if (this.blinkWindowStart === 0) this.blinkWindowStart = sample.ts;

      // Count Detected→NotDetected transitions (each = one blink)
      if (
        this.lastBlinkStatus === DetectionStatus.Detected &&
        sample.blink === DetectionStatus.NotDetected
      ) {
        this.blinkTransitions++;
      }
      this.lastBlinkStatus = sample.blink;

      // Every 60 seconds, record a blink rate
      const elapsed = (sample.ts - this.blinkWindowStart) / 1000;
      if (elapsed >= 60) {
        this.blinkRates.push((this.blinkTransitions / elapsed) * 60);
        this.blinkTransitions = 0;
        this.blinkWindowStart = sample.ts;
      }
    }
  }

  /** Freeze baseline — call at end of warmup */
  freeze(): BaselineStats {
    if (this.frozen) return this.frozen;

    // If we haven't accumulated a full 60s blink window, use what we have
    if (this.blinkWindowStart > 0 && this.blinkTransitions > 0) {
      const lastElapsed = (Date.now() - this.blinkWindowStart) / 1000;
      if (lastElapsed > 10) {
        this.blinkRates.push((this.blinkTransitions / lastElapsed) * 60);
      }
    }

    this.frozen = {
      blinkRate: mean(this.blinkRates) || 15, // default ~15 blinks/min
      blinkRateSd: sd(this.blinkRates) || 3,
      hrv: mean(this.hrvs) || 40,
      hrvSd: sd(this.hrvs) || 10,
      breathingRate: mean(this.breathingRates) || 15,
      breathingRateSd: sd(this.breathingRates) || 2,
      eda: mean(this.edas) || 2.5,
      edaSd: sd(this.edas) || 0.5,
      pulse: mean(this.pulses) || 72,
      pulseSd: sd(this.pulses) || 5,
      sampleCount: this.pulses.length,
      frozenAt: Date.now(),
    };

    console.log(
      `[baseline] frozen: pulse=${this.frozen.pulse.toFixed(1)} hrv=${this.frozen.hrv.toFixed(1)} ` +
        `br=${this.frozen.breathingRate.toFixed(1)} eda=${this.frozen.eda.toFixed(2)} ` +
        `blink=${this.frozen.blinkRate.toFixed(1)}/min (${this.frozen.sampleCount} samples)`
    );

    return this.frozen;
  }

  get stats(): BaselineStats | null {
    return this.frozen;
  }

  get isFrozen(): boolean {
    return this.frozen !== null;
  }

  reset(): void {
    this.pulses = [];
    this.hrvs = [];
    this.breathingRates = [];
    this.edas = [];
    this.blinkTransitions = 0;
    this.lastBlinkStatus = null;
    this.blinkWindowStart = 0;
    this.blinkRates = [];
    this.frozen = null;
  }
}

function mean(arr: number[]): number {
  if (arr.length === 0) return 0;
  return arr.reduce((a, b) => a + b, 0) / arr.length;
}

function sd(arr: number[]): number {
  if (arr.length < 2) return 0;
  const m = mean(arr);
  const variance = arr.reduce((sum, x) => sum + (x - m) ** 2, 0) / (arr.length - 1);
  return Math.sqrt(variance);
}
