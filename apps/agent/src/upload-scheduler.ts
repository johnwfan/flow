import type {
  AppContextMessage,
  SampleMessage,
  ThoughtProbeMessage,
  WsMessage,
} from "@flow/shared";
import { ApiClient } from "./api-client.js";

const FLUSH_INTERVAL_MS = 30_000;

interface RawEvent {
  ts: number;
  kind: string;
  payload: unknown;
}

/**
 * Accumulates non-sample events between 30s flushes and pairs them with a
 * drain of the sample ring buffer, per the API's batch contract (see
 * apps/api/src/lib/batchInsert.ts). One flush = one POST .../batch call.
 */
export class UploadScheduler {
  private events: RawEvent[] = [];
  private contexts: AppContextMessage[] = [];
  private probes: ThoughtProbeMessage[] = [];
  private timer: ReturnType<typeof setInterval> | null = null;

  constructor(
    private api: ApiClient,
    private getSessionId: () => string | null,
    private drainSamples: () => SampleMessage[]
  ) {}

  /** Record a broadcast message for the next batch, if it belongs in one. */
  record(msg: WsMessage): void {
    switch (msg.kind) {
      case "state":
        this.events.push({ ts: msg.ts, kind: "state", payload: { state: msg.state, reasons: msg.reasons } });
        break;
      case "alert":
        this.events.push({
          ts: msg.ts,
          kind: "alert",
          payload: { type: msg.type, reasons: msg.reasons, duration_s: msg.duration_s },
        });
        break;
      case "session_control":
        if (msg.action === "pause" || msg.action === "resume") {
          this.events.push({ ts: msg.ts, kind: "session_control", payload: { action: msg.action } });
        }
        // start/end go through ApiClient.startSession()/endSession() directly,
        // not through the generic events array (see INTEGRATION.md).
        break;
      case "app_context":
        this.contexts.push(msg);
        break;
      case "thought_probe":
        this.probes.push(msg);
        break;
      // "sample" comes from pipeline.uploadBuffer at flush time, not here.
      // "breathing_guide" isn't part of the persistence contract.
    }
  }

  start(): void {
    if (this.timer) return;
    this.timer = setInterval(() => this.flush(), FLUSH_INTERVAL_MS);
  }

  stop(): void {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }

  /** Flush whatever's accumulated right now, regardless of the timer. */
  flush(): void {
    const sessionId = this.getSessionId();
    const samples = this.drainSamples();

    if (!sessionId) {
      // No persisted session (API was unreachable at start) — drop rather
      // than accumulate unboundedly. Live WS clients already saw this data.
      this.events = [];
      this.contexts = [];
      this.probes = [];
      return;
    }

    if (samples.length === 0 && this.events.length === 0 && this.contexts.length === 0 && this.probes.length === 0) {
      return;
    }

    this.api.queueBatch(sessionId, {
      samples,
      events: this.events,
      contexts: this.contexts,
      probes: this.probes,
    });

    this.events = [];
    this.contexts = [];
    this.probes = [];
  }
}
