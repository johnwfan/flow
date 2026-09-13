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
        if (code !== 0) {
          console.log(`[sdk] validation: ${hint} (code=${code})`);
          this.onValidation?.(code, hint);
        }
      });

      this.sdk.on("metrics", (buf: Buffer, timestampUs: number) => {
        const metrics = decodeMetrics(buf) as any;
        if (Buffer.isBuffer(metrics)) return; // not decoded yet

        const sample = this.mapToSample(metrics, timestampUs);
        this.onSample(sample);
      });

      this.sdk.on("error", (code: number, message: string, retryable: boolean) => {
        console.error(`[sdk] error ${code}: ${message} (retryable=${retryable})`);
        this.onError?.(code, message, retryable);
      });

      console.log("[sdk] initialized");
      return true;
    } catch (err: any) {
      console.warn(`[sdk] init failed: ${err.message}`);
      return false;
    }
  }

  start(): void {
    if (!this.sdk) {
      console.error("[sdk] not initialized — call init() first");
      return;
    }
    if (this.running) {
      console.warn("[sdk] start() called while already running — ignoring duplicate start");
      return;
    }
    try {
      this.sdk.useCamera({ deviceIndex: this.cameraIndex });
      this.sdk.start();
      this.running = true;
      console.log("[sdk] camera capture started");
    } catch (err: any) {
      // The native binding throws synchronously (e.g. camera already in use
      // by another process, or a duplicate start reaching the native layer).
      // Never let this crash the whole agent process mid-session.
      console.error(`[sdk] start failed: ${err.message} — is another app using the camera?`);
      this.running = false;
    }
  }

  async stop(): Promise<void> {
    if (!this.sdk || !this.running) return;
    await this.sdk.stopAsync();
    this.running = false;
    console.log("[sdk] camera capture stopped");
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
    const breathingRate = metrics.breathing?.rate?.at(-1)?.value ?? null;
    const hrvRmssd = metrics.cardio?.hrv?.at(-1)?.rmssd ?? null;
    const edaTrace = metrics.eda?.trace?.at(-1)?.value ?? null;
    const blinkDetected = metrics.face?.blinking?.at(-1)?.detected;
    const talkingDetected = metrics.face?.talking?.at(-1)?.detected;
    const faceLandmarks = metrics.face?.landmarks?.at(-1)?.value ?? null;
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
