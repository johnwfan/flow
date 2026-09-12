import { DetectionStatus } from "@flow/shared";
import type { SampleMessage } from "@flow/shared";

/**
 * Mock emitter generates synthetic SampleMessage data at 20Hz.
 * Produces realistic physiological values with slow drift for dev/demo.
 */
export class MockEmitter {
  private interval: ReturnType<typeof setInterval> | null = null;
  private startTime = 0;
  private frameCount = 0;
  private blinkState = false;
  private lastBlinkToggle = 0;

  constructor(private onSample: (sample: SampleMessage) => void) {}

  start(): void {
    if (this.interval) return;
    this.startTime = Date.now();
    this.frameCount = 0;
    this.lastBlinkToggle = 0;

    // 20Hz = 50ms interval
    this.interval = setInterval(() => {
      this.emitSample();
    }, 50);

    console.log("[mock] emitter started at 20Hz");
  }

  stop(): void {
    if (this.interval) {
      clearInterval(this.interval);
      this.interval = null;
      console.log(`[mock] emitter stopped after ${this.frameCount} frames`);
    }
  }

  get isRunning(): boolean {
    return this.interval !== null;
  }

  private emitSample(): void {
    const elapsed = (Date.now() - this.startTime) / 1000;
    this.frameCount++;

    // Slow sinusoidal drift for realistic-looking data
    const pulseDrift = Math.sin(elapsed * 0.1) * 8;
    const breathDrift = Math.sin(elapsed * 0.07) * 2;
    const hrvDrift = Math.sin(elapsed * 0.05) * 10;

    // Blink: toggle every 3-6 seconds
    if (elapsed - this.lastBlinkToggle > 3 + Math.random() * 3) {
      this.blinkState = !this.blinkState;
      this.lastBlinkToggle = elapsed;
    }

    const sample: SampleMessage = {
      kind: "sample",
      ts: Date.now(),
      pulse_bpm: 72 + pulseDrift + (Math.random() - 0.5) * 2,
      breathing_rpm: 15 + breathDrift + (Math.random() - 0.5) * 0.5,
      hrv_ms: 42 + hrvDrift + (Math.random() - 0.5) * 3,
      eda_us: 2.5 + Math.sin(elapsed * 0.03) * 0.5 + (Math.random() - 0.5) * 0.2,
      conf: 0.85 + Math.sin(elapsed * 0.02) * 0.08,
      blink: this.blinkState ? DetectionStatus.Detected : DetectionStatus.NotDetected,
      talking: DetectionStatus.NotDetected,
      landmarks: null,
      expressions: null,
    };

    this.onSample(sample);
  }
}
