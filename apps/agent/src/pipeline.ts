import type { SampleMessage, StateMessage, AlertMessage, AppContextMessage, ThoughtProbeMessage, BreathingGuideMessage, WsMessage } from "@flow/shared";
import { BaselineCollector } from "./baseline.js";
import { Classifier } from "./classifier.js";
import { WindowTracker } from "./window-tracker.js";
import { ProbeScheduler } from "./probe-scheduler.js";
import { BreathingGuideScheduler } from "./breathing-guide.js";
import { RingBuffer } from "./ring-buffer.js";
import { watchThresholds } from "./thresholds.js";

export interface PipelineCallbacks {
  broadcast: (msg: WsMessage) => void;
}

/**
 * Wires together: baseline → classifier → window tracker → probe scheduler.
 * Receives samples from the emitter/SDK and routes through the pipeline.
 */
export class Pipeline {
  private baseline: BaselineCollector;
  private classifier: Classifier | null = null;
  private windowTracker: WindowTracker;
  private probeScheduler: ProbeScheduler | null = null;
  private breathingGuide: BreathingGuideScheduler;

  /** Ring buffer for upload batching (30s at 20Hz = 600 samples) */
  readonly uploadBuffer = new RingBuffer<SampleMessage>(600);

  /** Rolling recent breathing-rate samples, used to pace the breathing guide */
  private recentBreathingRates: number[] = [];

  private warmupComplete = false;
  private callbacks: PipelineCallbacks;

  constructor(callbacks: PipelineCallbacks) {
    this.callbacks = callbacks;
    this.baseline = new BaselineCollector();

    this.windowTracker = new WindowTracker({
      onContext: (msg: AppContextMessage) => {
        callbacks.broadcast(msg);
      },
      onCategoryChange: (category) => {
        if (this.classifier) {
          this.classifier.setCategory(category);
        }
      },
    });

    this.breathingGuide = new BreathingGuideScheduler({
      getCurrentRpm: () => this.getCurrentBreathingRpm(),
      callbacks: {
        onPhase: (msg: BreathingGuideMessage) => {
          callbacks.broadcast(msg);
        },
      },
    });

    // Start watching thresholds for hot-reload
    watchThresholds();
  }

  /** Rolling average of recent measured breathing rate (RPM), 0 if none yet. */
  private getCurrentBreathingRpm(): number {
    if (this.recentBreathingRates.length === 0) return 0;
    const sum = this.recentBreathingRates.reduce((a, b) => a + b, 0);
    return sum / this.recentBreathingRates.length;
  }

  /** Called by session when warmup ends — freeze baseline and start classifier */
  onWarmupComplete(): void {
    if (this.warmupComplete) return;
    this.warmupComplete = true;

    const stats = this.baseline.freeze();
    console.log("[pipeline] warmup complete — starting classifier");

    this.classifier = new Classifier(stats, {
      onStateChange: (msg: StateMessage) => {
        this.callbacks.broadcast(msg);
      },
      onAlert: (msg: AlertMessage) => {
        this.callbacks.broadcast(msg);
        // Suppress probes during and after alerts
        if (this.probeScheduler) {
          this.probeScheduler.suppressPostAlert();
        }
        // Paced breathing guide is part of the intervention for both
        // alert types — zone-out (re-engage) and spiral (calm down)
        this.breathingGuide.start();
      },
    });
    this.classifier.start();

    // Start probe scheduler
    this.probeScheduler = new ProbeScheduler({
      onProbe: (msg: ThoughtProbeMessage) => {
        this.callbacks.broadcast(msg);
      },
      getClassifierState: () => {
        return this.classifier?.state ?? import("@flow/shared").then(() => {
          // unreachable fallback
          throw new Error("classifier not initialized");
        }) as never;
      },
    });
    this.probeScheduler.start();
  }

  /** Process a sample through the pipeline */
  processSample(sample: SampleMessage): void {
    // Always buffer for upload
    this.uploadBuffer.push(sample);

    // Track recent breathing rate for guide pacing. Was a 20-reading
    // window -- since breathing_rpm only updates once every few seconds
    // (not every 20Hz sample), that stretched over a minute or more of
    // history, so the paced guide kept breathing-pacing the user's rate
    // from a while ago instead of right now. Shorter window = it catches
    // up to an actual rate change in a few readings instead of a couple
    // dozen.
    if (sample.breathing_rpm != null) {
      this.recentBreathingRates.push(sample.breathing_rpm);
      if (this.recentBreathingRates.length > 6) this.recentBreathingRates.shift();
    }

    if (!this.warmupComplete) {
      // During warmup: collect baseline
      this.baseline.addSample(sample);
    } else if (this.classifier) {
      // Post-warmup: feed classifier
      this.classifier.addSample(sample);
    }
  }

  /** Start window tracking */
  startTracking(): void {
    this.windowTracker.start();
  }

  /** Stop everything */
  stop(): void {
    this.classifier?.stop();
    this.windowTracker.stop();
    this.probeScheduler?.stop();
    this.breathingGuide.stop();
  }

  /** Reset for a new session */
  reset(): void {
    this.stop();
    this.baseline.reset();
    this.classifier = null;
    this.probeScheduler = null;
    this.warmupComplete = false;
    this.uploadBuffer.clear();
    this.recentBreathingRates = [];
  }
}
