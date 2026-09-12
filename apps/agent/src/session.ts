import { randomUUID } from "node:crypto";
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { State } from "@flow/shared";
import type { SessionControlMessage, StateMessage } from "@flow/shared";

export type SessionPhase = "idle" | "warmup" | "active" | "paused" | "ended";

const DEVICE_ID_FILE = ".flow-device-id";

export class Session {
  readonly deviceId: string;
  sessionId: string | null = null;
  phase: SessionPhase = "idle";
  startedAt: number | null = null;

  private warmupTimer: ReturnType<typeof setTimeout> | null = null;
  private onStateChange?: (state: StateMessage) => void;
  private onWarmupComplete?: () => void;

  constructor(opts?: {
    onStateChange?: (state: StateMessage) => void;
    onWarmupComplete?: () => void;
  }) {
    this.deviceId = Session.loadOrCreateDeviceId();
    this.onStateChange = opts?.onStateChange;
    this.onWarmupComplete = opts?.onWarmupComplete;
    console.log(`[session] device_id: ${this.deviceId}`);
  }

  handleControl(msg: SessionControlMessage): void {
    switch (msg.action) {
      case "start":
        this.start(msg.session_id);
        break;
      case "end":
        this.end();
        break;
      case "pause":
        this.pause();
        break;
      case "resume":
        this.resume();
        break;
    }
  }

  start(sessionId?: string): void {
    if (this.phase !== "idle" && this.phase !== "ended") {
      console.warn(`[session] cannot start from phase: ${this.phase}`);
      return;
    }
    this.sessionId = sessionId || randomUUID();
    this.phase = "warmup";
    this.startedAt = Date.now();
    console.log(`[session] started ${this.sessionId} — warmup (4 min)`);
    this.emitState(State.Warmup, ["baseline_calibration"]);

    // Warmup lasts 4 minutes, then transition to active
    this.warmupTimer = setTimeout(() => {
      if (this.phase === "warmup") {
        this.phase = "active";
        console.log("[session] warmup complete — active");
        this.emitState(State.Focused, ["warmup_complete"]);
        if (this.onWarmupComplete) this.onWarmupComplete();
      }
    }, 4 * 60 * 1000);
  }

  end(): void {
    if (this.phase === "idle" || this.phase === "ended") {
      console.warn(`[session] cannot end from phase: ${this.phase}`);
      return;
    }
    if (this.warmupTimer) {
      clearTimeout(this.warmupTimer);
      this.warmupTimer = null;
    }
    const duration = this.startedAt ? Math.round((Date.now() - this.startedAt) / 1000) : 0;
    this.phase = "ended";
    console.log(`[session] ended ${this.sessionId} — ${duration}s`);
    this.sessionId = null;
    this.startedAt = null;
  }

  pause(): void {
    if (this.phase !== "active" && this.phase !== "warmup") {
      console.warn(`[session] cannot pause from phase: ${this.phase}`);
      return;
    }
    this.phase = "paused";
    console.log("[session] paused");
  }

  resume(): void {
    if (this.phase !== "paused") {
      console.warn(`[session] cannot resume from phase: ${this.phase}`);
      return;
    }
    this.phase = "active";
    console.log("[session] resumed");
    this.emitState(State.Focused, ["resumed"]);
  }

  /** Whether samples should be emitted */
  get shouldEmit(): boolean {
    return this.phase === "warmup" || this.phase === "active";
  }

  private emitState(state: State, reasons: string[]): void {
    if (this.onStateChange) {
      this.onStateChange({
        kind: "state",
        state,
        reasons,
        confidence: 1.0,
        ts: Date.now(),
      });
    }
  }

  private static loadOrCreateDeviceId(): string {
    const filePath = join(process.cwd(), DEVICE_ID_FILE);
    if (existsSync(filePath)) {
      return readFileSync(filePath, "utf-8").trim();
    }
    const id = randomUUID();
    writeFileSync(filePath, id, "utf-8");
    return id;
  }
}
