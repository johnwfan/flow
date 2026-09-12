// ── State & Category enums ──────────────────────────────────────────

export enum State {
  Focused = "focused",
  ZonedOut = "zoned_out",
  Spiraling = "spiraling",
  NoSignal = "no_signal",
  Warmup = "warmup",
}

export enum Category {
  Study = "study",
  Social = "social",
  Entertainment = "entertainment",
  Productivity = "productivity",
  Communication = "communication",
  System = "system",
  Unknown = "unknown",
}

export enum DetectionStatus {
  Detected = "detected",
  NotDetected = "not_detected",
  Unknown = "unknown",
}

// ── Message types ───────────────────────────────────────────────────

export interface SampleMessage {
  kind: "sample";
  ts: number;
  pulse_bpm: number | null;
  breathing_rpm: number | null;
  hrv_ms: number | null;
  eda_us: number | null;
  conf: number | null; // 0–1 normalized
  blink: DetectionStatus | null;
  talking: DetectionStatus | null;
  landmarks: number[][] | null;
  expressions: Record<string, number> | null;
}

export interface StateMessage {
  kind: "state";
  state: State;
  reasons: string[];
  confidence: number;
  ts: number;
}

export interface AlertMessage {
  kind: "alert";
  type: "zone_out" | "spiral";
  reasons: string[];
  ts: number;
  duration_s: number;
}

export interface AppContextMessage {
  kind: "app_context";
  app_title: string;
  category: Category;
  ts: number;
}

export interface ThoughtProbeMessage {
  kind: "thought_probe";
  ts: number;
  classifier_state: State;
  user_response: string | null;
}

export interface BreathingGuideMessage {
  kind: "breathing_guide";
  phase: "inhale" | "exhale" | "hold";
  duration_ms: number;
  measured_rpm: number;
  ie_ratio: number;
}

export interface SessionControlMessage {
  kind: "session_control";
  action: "start" | "end" | "pause" | "resume";
  session_id: string;
  ts: number;
}

// ── Union type ──────────────────────────────────────────────────────

export type WsMessage =
  | SampleMessage
  | StateMessage
  | AlertMessage
  | AppContextMessage
  | ThoughtProbeMessage
  | BreathingGuideMessage
  | SessionControlMessage;
