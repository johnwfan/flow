import { randomUUID } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type {
  AppContextMessage,
  SampleMessage,
  ThoughtProbeMessage,
} from "@flow/shared";

interface RawEvent {
  ts: number;
  kind: string;
  payload: unknown;
}

interface BatchPayload {
  batchKey: string;
  samples: SampleMessage[];
  events: RawEvent[];
  contexts: AppContextMessage[];
  probes: ThoughtProbeMessage[];
}

interface PendingBatch {
  sessionId: string;
  batchKey: string;
  payload: BatchPayload;
}

const BACKOFF_START_MS = 2000;
const BACKOFF_MAX_MS = 60000;

/**
 * Talks to the Fastify API (POST /v1/sessions, /v1/sessions/:id/batch,
 * /v1/sessions/:id/end). Failed batches spill to disk (R022) and retry
 * with exponential backoff, in order, surviving an agent restart.
 */
export class ApiClient {
  private baseUrl: string;
  private deviceId: string;
  private spillPath: string;
  private pending: PendingBatch[] = [];
  private backoffMs = BACKOFF_START_MS;
  private retryTimer: ReturnType<typeof setTimeout> | null = null;
  private sending = false;

  constructor(opts: { baseUrl: string; deviceId: string; spillDir: string }) {
    this.baseUrl = opts.baseUrl.replace(/\/$/, "");
    this.deviceId = opts.deviceId;
    mkdirSync(opts.spillDir, { recursive: true });
    this.spillPath = join(opts.spillDir, "pending-batches.jsonl");
    this.loadSpill();
  }

  private loadSpill(): void {
    if (!existsSync(this.spillPath)) return;
    try {
      const raw = readFileSync(this.spillPath, "utf-8");
      const lines = raw.split("\n").filter((l) => l.trim().length > 0);
      this.pending = lines.map((l) => JSON.parse(l) as PendingBatch);
      if (this.pending.length > 0) {
        console.log(`[api] loaded ${this.pending.length} unsent batch(es) from a previous run`);
      }
    } catch (err: any) {
      console.warn(`[api] failed to read spill file, starting fresh: ${err.message}`);
      this.pending = [];
    }
  }

  private saveSpill(): void {
    try {
      writeFileSync(this.spillPath, this.pending.map((p) => JSON.stringify(p)).join("\n") + (this.pending.length ? "\n" : ""));
    } catch (err: any) {
      console.warn(`[api] failed to write spill file: ${err.message}`);
    }
  }

  /** POST /v1/sessions — returns the new sessionId, or null on failure (caller falls back to local-only). */
  async startSession(): Promise<string | null> {
    try {
      const res = await fetch(`${this.baseUrl}/v1/sessions`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ deviceId: this.deviceId }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = (await res.json()) as { sessionId: string };
      console.log(`[api] session registered: ${data.sessionId}`);
      return data.sessionId;
    } catch (err: any) {
      console.warn(`[api] failed to start session (continuing local-only, no persistence this session): ${err.message}`);
      return null;
    }
  }

  /** Queue a batch for this session. Never throws — failures spill to disk and retry in the background. */
  queueBatch(
    sessionId: string,
    payload: Omit<BatchPayload, "batchKey">
  ): void {
    const batchKey = randomUUID();
    this.pending.push({ sessionId, batchKey, payload: { ...payload, batchKey } });
    this.saveSpill();
    this.trySendAll();
  }

  /** POST /v1/sessions/:id/end. Flushes any still-pending batches first (best-effort, doesn't block on them). */
  async endSession(sessionId: string): Promise<void> {
    this.trySendAll();
    try {
      const res = await fetch(`${this.baseUrl}/v1/sessions/${sessionId}/end`, { method: "POST" });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      console.log(`[api] session ended: ${sessionId}`);
    } catch (err: any) {
      console.warn(`[api] failed to close session ${sessionId} (rollups/narrative won't run for it): ${err.message}`);
    }
  }

  private trySendAll(): void {
    if (this.sending) return;
    this.sending = true;
    void this.drainQueue();
  }

  private async drainQueue(): Promise<void> {
    while (this.pending.length > 0) {
      const next = this.pending[0]!;
      try {
        const res = await fetch(`${this.baseUrl}/v1/sessions/${next.sessionId}/batch`, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(next.payload),
        });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const result = (await res.json()) as { deduped: boolean };
        console.log(
          `[api] batch uploaded (${next.payload.samples.length} samples, ${next.payload.events.length} events)${result.deduped ? " [deduped]" : ""}`
        );
        this.pending.shift();
        this.saveSpill();
        this.backoffMs = BACKOFF_START_MS; // reset on success
      } catch (err: any) {
        console.warn(
          `[api] batch upload failed (${this.pending.length} pending) — retrying in ${Math.round(this.backoffMs / 1000)}s: ${err.message}`
        );
        this.sending = false;
        if (this.retryTimer) clearTimeout(this.retryTimer);
        this.retryTimer = setTimeout(() => this.trySendAll(), this.backoffMs);
        this.backoffMs = Math.min(this.backoffMs * 2, BACKOFF_MAX_MS);
        return;
      }
    }
    this.sending = false;
  }
}
