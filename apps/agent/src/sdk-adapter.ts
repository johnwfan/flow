import { DetectionStatus } from "@flow/shared";
import type { SampleMessage } from "@flow/shared";

/**
 * SmartSpectra SDK adapter — wraps the @smartspectra/node-sdk
 * and maps its output to our SampleMessage format.
 *
 * Falls back gracefully if the SDK or camera is unavailable.
 */
export class SdkAdapter {
  private sdk: any = null;
  private onSample: (sample: SampleMessage) => void;
  private onValidation?: (code: number, hint: string) => void;
  private onError?: (code: number, message: string, retryable: boolean) => void;
  private running = false;
  private apiKey: string;
  private cameraIndex: number;
  // Set whenever the native session errors out (sync throw from start(), or
  // an async 'error' event). The SDK requires reset() to rebuild the
  // pipeline after kError before the next start() — skipping it is why a
  // single camera-open failure used to wedge every subsequent start() with
  // a misleading "session already started" instead of actually retrying.
  private needsReset = false;

  constructor(opts: {
    apiKey: string;
    cameraIndex?: number;
    onSample: (sample: SampleMessage) => void;
    /** SDK framing/quality hints (e.g. "Place more of the chest in view") */
    onValidation?: (code: number, hint: string) => void;
    /** Fatal or retryable SDK errors (camera unavailable, auth failure, etc.) */
    onError?: (code: number, message: string, retryable: boolean) => void;
  }) {
    this.apiKey = opts.apiKey;
    this.cameraIndex = opts.cameraIndex ?? 0;
    this.onSample = opts.onSample;
    this.onValidation = opts.onValidation;
    this.onError = opts.onError;
  }

  async init(): Promise<boolean> {
    try {
      // Dynamic import so the module is optional at build time
      // eslint-disable-next-line @typescript-eslint/ban-ts-comment
      // @ts-ignore — @smartspectra/node-sdk is an optional runtime dep
      const sdkMod = await import("@smartspectra/node-sdk");
      const {
        SmartSpectraSDK,
        breathingMetrics,
        cardioMetrics,
        faceMetrics,
        edaMetrics,
        decodeMetrics,
      } = sdkMod;

      this.sdk = new SmartSpectraSDK({
        apiKey: this.apiKey,
        requestedMetrics: [
          ...breathingMetrics,
          ...cardioMetrics,
          ...faceMetrics,
          ...edaMetrics,
        ],
      });

      this.sdk.on("processingStatus", (status: number) => {
        const labels: Record<number, string> = {
          0: "uninitialized",
          1: "idle",
          2: "starting",
          3: "running",
          4: "stopping",
          5: "error",
        };
        console.log(`[sdk] processing status: ${labels[status] ?? status}`);
      });

      this.sdk.on("validationStatus", (code: number, _ts: number, hint: string) => {
        // Forward every status, including kOk (0) -- callers need kOk to
        // confirm the opened camera is actually seeing a face (e.g. the
        // face-search watchdog in index.ts), not just that it opened
        // without throwing. Only log the non-OK ones to avoid spamming
        // the console every frame while things are fine.
        if (code !== 0) {
          console.log(`[sdk] validation: ${hint} (code=${code})`);
        }
        this.onValidation?.(code, hint);
      });

      this.sdk.on("metrics", (buf: Buffer, timestampUs: number) => {
        const metrics = decodeMetrics(buf) as any;
        if (Buffer.isBuffer(metrics)) return; // not decoded yet

        const sample = this.mapToSample(metrics, timestampUs);
        this.onSample(sample);
      });

      this.sdk.on("error", (code: number, message: string, retryable: boolean) => {
        console.error(`[sdk] error ${code}: ${message} (retryable=${retryable})`);
        this.running = false;
        this.needsReset = true;
        this.onError?.(code, message, retryable);
      });

      console.log("[sdk] initialized");
      return true;
    } catch (err: any) {
      console.warn(`[sdk] init failed: ${err.message}`);
      return false;
    }
  }

  /** Change which camera device the next start() opens. No-op while running. */
  setCameraIndex(index: number): void {
    this.cameraIndex = index;
  }

  forceResetBeforeNextStart(): void {
    this.running = false;
    this.needsReset = true;
  }

  start(): boolean {
    if (!this.sdk) {
      console.error("[sdk] not initialized — call init() first");
      return false;
    }
    if (this.running) {
      console.warn("[sdk] start() called while already running — ignoring duplicate start");
      return true;
    }
    if (this.needsReset) {
      // Rebuild the native pipeline after a prior error. Without this, the
      // next useCamera()+start() below throws "session already started"
      // forever instead of actually retrying, regardless of camera index.
      try {
        this.sdk.reset();
      } catch (err: any) {
        console.warn(`[sdk] reset before retry failed: ${err.message}`);
      }
      this.needsReset = false;
    }
    try {
      // Pin a conservative, near-universally-supported capture mode
      // instead of leaving width/height/fps at "0 = SDK default". Left
      // unset, some cheap UVC webcams (including ones rated for 60fps)
      // negotiate a mode their USB bandwidth/MJPEG decode can't actually
      // sustain, so real delivered frames arrive late/bursty. SmartSpectra
      // then reports "Use a camera mode that provides at least 25 frames
      // per second" (kFrameRateTooLow) and eventually hard-errors with
      // kTimestampGap (a gap between frame timestamps) and shuts the
      // pipeline down. rPPG doesn't need high resolution -- a stable
      // framerate matters far more than pixel detail -- so 640x480@30fps
      // trades resolution we don't need for framerate stability every UVC
      // camera can actually sustain.
      this.sdk.useCamera({ deviceIndex: this.cameraIndex, width: 640, height: 480, fps: 30 });
      this.sdk.start();
      this.running = true;
      console.log(`[sdk] camera capture started (device index ${this.cameraIndex}, 640x480@30)`);
      return true;
    } catch (err: any) {
      // The native binding throws synchronously (e.g. camera already in use
      // by another process, camera index doesn't exist, or a duplicate
      // start reaching the native layer). Never let this crash the whole
      // agent process mid-session — mark for reset so the next start()
      // (same or different camera index) actually gets a clean attempt.
      console.error(`[sdk] start failed: ${err.message} — is another app using the camera?`);
      this.running = false;
      this.needsReset = true;
      this.onError?.(-1, err.message, true);
      return false;
    }
  }

  async stop(): Promise<void> {
    if (!this.sdk || !this.running) return;
    this.running = false;
    try {
      await this.sdk.stopAsync();
      console.log("[sdk] camera capture stopped");
    } catch (err) {
      this.needsReset = true;
      throw err;
    }
  }

  async destroy(): Promise<void> {
    if (this.sdk) {
      await this.stop();
      await this.sdk.destroy();
      this.sdk = null;
      console.log("[sdk] destroyed");
    }
  }

  private mapToSample(metrics: any, timestampUs: number): SampleMessage {
    const pulseRate = metrics.cardio?.pulseRate?.at(-1)?.value ?? null;
    const rawBreathingRate = metrics.breathing?.rate?.at(-1)?.value ?? null;
    // A single implausible reading (chest partially out of frame, brief
    // motion) shouldn't reach the classifier/display/guide at all --
    // reject outside a generous physiological range instead of letting it
    // through, so downstream code can afford to react quickly to what's
    // left without also reacting quickly to garbage. Wide bounds on
    // purpose (panic/exertion can push well past a resting rate).
    const breathingRate =
      rawBreathingRate != null && rawBreathingRate >= 4 && rawBreathingRate <= 45 ? rawBreathingRate : null;
    const hrvRmssd = metrics.cardio?.hrv?.at(-1)?.rmssd ?? null;
    const edaTrace = metrics.eda?.trace?.at(-1)?.value ?? null;
    const blinkDetected = metrics.face?.blinking?.at(-1)?.detected;
    const talkingDetected = metrics.face?.talking?.at(-1)?.detected;
    const faceLandmarks = normalizeLandmarks(metrics.face?.landmarks?.at(-1)?.value ?? null);
    const expression = metrics.face?.expression?.at(-1) ?? null;

    // Confidence from cardio if available, else default
    const conf = metrics.cardio?.pulseRate?.at(-1)?.confidence;
    // SDK confidence is 0-100, normalize to 0-1
    const normalizedConf = conf != null ? conf / 100 : null;

    return {
      kind: "sample",
      ts: Math.round(timestampUs / 1000), // µs → ms
      pulse_bpm: pulseRate,
      breathing_rpm: breathingRate,
      hrv_ms: hrvRmssd,
      eda_us: edaTrace,
      conf: normalizedConf,
      blink: mapDetection(blinkDetected),
      talking: mapDetection(talkingDetected),
      landmarks: faceLandmarks,
      expressions: expression ? flattenExpression(expression) : null,
    };
  }
}

function mapDetection(detected: boolean | undefined | null): DetectionStatus | null {
  if (detected === true) return DetectionStatus.Detected;
  if (detected === false) return DetectionStatus.NotDetected;
  return DetectionStatus.Unknown;
}

function flattenExpression(expr: any): Record<string, number> | null {
  if (!expr || typeof expr !== "object") return null;
  const result: Record<string, number> = {};
  for (const [key, val] of Object.entries(expr)) {
    if (typeof val === "number") {
      result[key] = val;
    }
  }
  return Object.keys(result).length > 0 ? result : null;
}

function normalizeLandmarks(raw: unknown): number[][] | null {
  const value =
    raw &&
    typeof raw === "object" &&
    "value" in raw &&
    (raw as { value?: unknown }).value != null
      ? (raw as { value: unknown }).value
      : raw;
  const points =
    value &&
    typeof value === "object" &&
    !Array.isArray(value) &&
    "points" in value
      ? (value as { points?: unknown }).points
      : value;

  if (!Array.isArray(points) || points.length === 0) return null;

  if (points.every((point) => typeof point === "number")) {
    const paired: number[][] = [];
    for (let i = 0; i + 1 < points.length; i += 2) {
      const x = points[i];
      const y = points[i + 1];
      if (typeof x === "number" && Number.isFinite(x) && typeof y === "number" && Number.isFinite(y)) {
        paired.push([x, y]);
      }
    }
    return paired.length > 0 ? paired : null;
  }

  const normalized: number[][] = [];
  for (const point of points) {
    const xy = landmarkPoint(point);
    if (xy) normalized.push(xy);
  }
  return normalized.length > 0 ? normalized : null;
}

function landmarkPoint(point: unknown): number[] | null {
  if (Array.isArray(point)) {
    const [x, y] = point;
    return typeof x === "number" && Number.isFinite(x) && typeof y === "number" && Number.isFinite(y)
      ? [x, y]
      : null;
  }

  if (!point || typeof point !== "object") return null;
  const candidate = point as Record<string, unknown>;
  const x = candidate.x ?? candidate.X ?? candidate[0];
  const y = candidate.y ?? candidate.Y ?? candidate[1];
  return typeof x === "number" && Number.isFinite(x) && typeof y === "number" && Number.isFinite(y)
    ? [x, y]
    : null;
}
