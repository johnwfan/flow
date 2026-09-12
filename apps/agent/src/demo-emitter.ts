import { readFileSync } from "node:fs";
import type { WsMessage } from "@flow/shared";

interface DemoEntry {
  /** ms offset from replay start */
  atMs: number;
  message: WsMessage;
}

/**
 * Replays a pre-recorded JSONL capture through the same WebSocket contract
 * as the live/mock emitters — the safety net for a live demo if the camera
 * or lighting fails (R012). Each line in the file is a DemoEntry; entries
 * are dispatched at their original relative offsets (optionally scaled).
 */
export class DemoEmitter {
  private entries: DemoEntry[] = [];
  private timers: ReturnType<typeof setTimeout>[] = [];
  private running = false;
  private frameCount = 0;

  constructor(
    private filePath: string,
    private onMessage: (msg: WsMessage) => void,
    private speed: number = 1
  ) {}

  /** Load and validate the JSONL capture. Throws with a clear message on bad data. */
  load(): void {
    const raw = readFileSync(this.filePath, "utf-8");
    const lines = raw.split("\n").filter((l) => l.trim().length > 0);
    this.entries = lines.map((line, i) => {
      try {
        return JSON.parse(line) as DemoEntry;
      } catch (err: any) {
        throw new Error(`[demo] malformed JSONL at line ${i + 1}: ${err.message}`);
      }
    });
    // Defensive: keep replay order regardless of how the file was authored
    this.entries.sort((a, b) => a.atMs - b.atMs);
    console.log(`[demo] loaded ${this.entries.length} entries from ${this.filePath}`);
  }

  start(): void {
    if (this.running) return;
    if (this.entries.length === 0) this.load();

    this.running = true;
    this.frameCount = 0;

    for (const entry of this.entries) {
      const delay = entry.atMs / this.speed;
      const timer = setTimeout(() => {
        this.frameCount++;
        this.onMessage(entry.message);
      }, delay);
      this.timers.push(timer);
    }

    const totalMs = this.entries.at(-1)?.atMs ?? 0;
    console.log(
      `[demo] replay started — ${this.entries.length} messages over ${(totalMs / 1000).toFixed(1)}s` +
        (this.speed !== 1 ? ` at ${this.speed}x speed` : "")
    );
  }

  stop(): void {
    if (!this.running) return;
    for (const t of this.timers) clearTimeout(t);
    this.timers = [];
    this.running = false;
    console.log(`[demo] replay stopped after ${this.frameCount} messages`);
  }

  get isRunning(): boolean {
    return this.running;
  }
}
