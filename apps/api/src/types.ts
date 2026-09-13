import type { AppContextMessage, SampleMessage, ThoughtProbeMessage } from "@flow/shared";

export interface CreateSessionBody {
  deviceId: string;
}

export interface RawEvent {
  ts: number;
  kind: string;
  payload: unknown;
}

export interface BatchBody {
  batchKey: string;
  samples: SampleMessage[];
  events: RawEvent[];
  contexts: AppContextMessage[];
  probes: ThoughtProbeMessage[];
}

export interface SpeakBody {
  lineId?: string;
  text?: string;
}
