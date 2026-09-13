import { fork, type ChildProcess } from "node:child_process";
import { dirname, extname, join } from "node:path";
import { fileURLToPath } from "node:url";
import type { SampleMessage } from "@flow/shared";

const SMARTSPECTRA_PROCESSING_FAILED_ERROR_CODE = 8;
const INITIAL_RESTART_DELAY_MS = 500;
const MAX_RESTART_DELAY_MS = 5_000;
const INIT_TIMEOUT_MS = 8_000;

type WorkerMessage =
  | { kind: "initResult"; ok: boolean }
  | { kind: "sample"; sample: SampleMessage }
  | { kind: "validation"; code: number; hint: string }
  | { kind: "error"; code: number; message: string; retryable: boolean }
  | { kind: "stopped" };

interface PendingInit {
  child: ChildProcess;
  resolve: (ok: boolean) => void;
  timeout: NodeJS.Timeout;
}

export class SdkWorkerAdapter {
  private child: ChildProcess | null = null;
  private pendingInit: PendingInit | null = null;
  private initPromise: Promise<boolean> | null = null;
  private restartTimer: NodeJS.Timeout | null = null;
  private restartDelayMs = INITIAL_RESTART_DELAY_MS;
  private ready = false;
  private runningDesired = false;
  private creditFailureSeen = false;
  private cameraIndex: number;
  private readonly workerPath: string;

  constructor(private readonly opts: {
    apiKey: string;
    cameraIndex?: number;
    onSample: (sample: SampleMessage) => void;
    onValidation?: (code: number, hint: string) => void;
    onError?: (code: number, message: string, retryable: boolean) => void;
  }) {
    this.cameraIndex = opts.cameraIndex ?? 0;
    const modulePath = fileURLToPath(import.meta.url);
    this.workerPath = join(dirname(modulePath), `sdk-worker${extname(modulePath)}`);
  }

  async init(): Promise<boolean> {
    return this.ensureWorker();
  }

  setCameraIndex(index: number): void {
    this.cameraIndex = index;
    this.send({ kind: "setCameraIndex", cameraIndex: index });
  }

  forceResetBeforeNextStart(): void {
    this.killWorker();
  }

  start(): boolean {
    this.runningDesired = true;
    void this.ensureWorker().then((ok) => {
      if (!ok || !this.runningDesired) return;
      if (!this.send({ kind: "start" })) {
        this.scheduleRestart("worker unavailable at start");
      }
    });
    return true;
  }

  async stop(): Promise<void> {
    this.runningDesired = false;
    this.clearRestartTimer();
    this.killWorker();
  }

  async destroy(): Promise<void> {
    await this.stop();
  }

  private ensureWorker(): Promise<boolean> {
    if (this.ready && this.child?.connected) return Promise.resolve(true);
    if (this.initPromise) return this.initPromise;

    const child = fork(this.workerPath, [], {
      cwd: process.cwd(),
      env: process.env,
      execArgv: process.execArgv,
      silent: true,
    });

    this.child = child;
    this.ready = false;
    this.creditFailureSeen = false;
    this.pipeOutput(child);

    child.on("message", (raw) => this.handleWorkerMessage(child, raw as WorkerMessage));
    child.on("exit", (code, signal) => this.handleWorkerExit(child, code, signal));
    child.on("error", (err) => {
      console.error(`[sdk-worker] process error: ${err.message}`);
    });

    this.initPromise = new Promise<boolean>((resolve) => {
      const timeout = setTimeout(() => {
        console.error("[sdk-worker] init timed out");
        this.resolvePendingInit(child, false);
      }, INIT_TIMEOUT_MS);
      this.pendingInit = { child, resolve, timeout };
    }).finally(() => {
      this.initPromise = null;
    });

    if (!this.send({ kind: "init", apiKey: this.opts.apiKey, cameraIndex: this.cameraIndex })) {
      this.resolvePendingInit(child, false);
    }
    return this.initPromise;
  }

  private handleWorkerMessage(child: ChildProcess, message: WorkerMessage): void {
    if (this.child !== child) return;
    switch (message.kind) {
      case "initResult":
        this.ready = message.ok;
        this.resolvePendingInit(child, message.ok);
        if (message.ok) this.restartDelayMs = INITIAL_RESTART_DELAY_MS;
        break;
      case "sample":
        this.restartDelayMs = INITIAL_RESTART_DELAY_MS;
        this.opts.onSample(message.sample);
        break;
      case "validation":
        this.restartDelayMs = INITIAL_RESTART_DELAY_MS;
        this.opts.onValidation?.(message.code, message.hint);
        break;
      case "error":
        if (message.code === SMARTSPECTRA_PROCESSING_FAILED_ERROR_CODE) {
          if (this.creditFailureSeen) {
            this.runningDesired = false;
            this.clearRestartTimer();
            this.opts.onError?.(
              402,
              "SmartSpectra API returned 402 Insufficient credits. Add credits or update SMARTSPECTRA_API_KEY in apps/agent/.env.",
              false
            );
            return;
          }
          console.warn("[sdk-worker] SmartSpectra processing failed; restarting camera worker without ending session");
          return;
        }
        this.opts.onError?.(message.code, message.message, message.retryable);
        break;
      case "stopped":
        break;
    }
  }

  private handleWorkerExit(child: ChildProcess, code: number | null, signal: NodeJS.Signals | null): void {
    if (this.child !== child) return;
    this.child = null;
    this.ready = false;
    this.resolvePendingInit(child, false);
    if (!this.runningDesired) return;
    this.scheduleRestart(`worker exited (${signal ?? code ?? "unknown"})`);
  }

  private resolvePendingInit(child: ChildProcess, ok: boolean): void {
    if (!this.pendingInit || this.pendingInit.child !== child) return;
    clearTimeout(this.pendingInit.timeout);
    const resolve = this.pendingInit.resolve;
    this.pendingInit = null;
    resolve(ok);
  }

  private scheduleRestart(reason: string): void {
    if (this.restartTimer) return;
    const delay = this.restartDelayMs;
    this.restartDelayMs = Math.min(this.restartDelayMs * 2, MAX_RESTART_DELAY_MS);
    console.warn(`[sdk-worker] ${reason}; retrying in ${delay}ms`);
    this.restartTimer = setTimeout(() => {
      this.restartTimer = null;
      void this.ensureWorker().then((ok) => {
        if (ok && this.runningDesired) this.send({ kind: "start" });
      });
    }, delay);
  }

  private clearRestartTimer(): void {
    if (this.restartTimer) {
      clearTimeout(this.restartTimer);
      this.restartTimer = null;
    }
  }

  private killWorker(): void {
    const child = this.child;
    if (!child) return;
    this.child = null;
    this.ready = false;
    this.resolvePendingInit(child, false);
    child.kill("SIGKILL");
  }

  private send(message: object): boolean {
    if (!this.child?.connected) return false;
    try {
      this.child.send(message);
      return true;
    } catch (err: any) {
      console.warn(`[sdk-worker] IPC send failed: ${err?.message ?? String(err)}`);
      return false;
    }
  }

  private pipeOutput(child: ChildProcess): void {
    let stdout = "";
    let stderr = "";
    child.stdout?.on("data", (chunk: Buffer) => {
      stdout = this.writeLines(stdout + chunk.toString(), console.log);
    });
    child.stderr?.on("data", (chunk: Buffer) => {
      stderr = this.writeLines(stderr + chunk.toString(), console.error);
    });
  }

  private writeLines(buffer: string, write: (line: string) => void): string {
    const lines = buffer.split(/\r?\n/);
    const tail = lines.pop() ?? "";
    for (const line of lines) {
      if (!line.trim()) continue;
      if (/insufficient credits|status:\s*402/i.test(line)) {
        this.creditFailureSeen = true;
      }
      write(`[sdk-worker] ${line}`);
    }
    return tail;
  }
}
