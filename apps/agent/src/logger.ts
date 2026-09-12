/**
 * Structured console logger for the agent.
 * Formats output so it's readable in a terminal / run.bat window.
 */
import { appendFileSync, mkdirSync, readdirSync, statSync, unlinkSync } from "node:fs";
import { join } from "node:path";

const MAX_LOG_FILES = 10;

/**
 * Tee console output to a rotating log file under logs/, so a judge or
 * teammate can check what happened after a run.bat session closes.
 * Keeps the most recent MAX_LOG_FILES runs, deleting older ones.
 */
export function initFileLogging(logsDir: string): void {
  try {
    mkdirSync(logsDir, { recursive: true });

    // Prune old logs before starting a new one
    const files = readdirSync(logsDir)
      .filter((f) => f.startsWith("agent-") && f.endsWith(".log"))
      .map((f) => ({ name: f, mtime: statSync(join(logsDir, f)).mtimeMs }))
      .sort((a, b) => b.mtime - a.mtime);
    for (const old of files.slice(MAX_LOG_FILES - 1)) {
      unlinkSync(join(logsDir, old.name));
    }

    const stamp = new Date().toISOString().replace(/[:.]/g, "-");
    const logPath = join(logsDir, `agent-${stamp}.log`);

    const write = (line: string) => {
      try {
        appendFileSync(logPath, line + "\n");
      } catch {
        // Never let logging failures crash the agent
      }
    };

    for (const method of ["log", "warn", "error"] as const) {
      const original = console[method].bind(console);
      console[method] = (...args: unknown[]) => {
        original(...args);
        write(args.map((a) => (typeof a === "string" ? a : JSON.stringify(a))).join(" "));
      };
    }

    console.log(`[logger] writing to ${logPath}`);
  } catch (err: any) {
    console.warn(`[logger] file logging disabled: ${err.message}`);
  }
}

export function logBanner(): void {
  console.log("");
  console.log("  ╔═══════════════════════════════════╗");
  console.log("  ║          Flow Agent v0.1           ║");
  console.log("  ╚═══════════════════════════════════╝");
  console.log("");
}

export function logConfig(opts: {
  mode: string;
  port: number;
  deviceId: string;
}): void {
  console.log(`  mode:      ${opts.mode}`);
  console.log(`  ws port:   ${opts.port}`);
  console.log(`  device:    ${opts.deviceId}`);
  console.log("");
}

let lastSampleLog = 0;
let sampleCount = 0;

/** Log sample rate every 5 seconds */
export function logSample(): void {
  sampleCount++;
  const now = Date.now();
  if (now - lastSampleLog >= 5000) {
    const rate = Math.round(sampleCount / ((now - lastSampleLog) / 1000));
    console.log(`[agent] ${rate} samples/sec, ${sampleCount} total`);
    sampleCount = 0;
    lastSampleLog = now;
  }
}

export function logShutdown(): void {
  console.log("\n[agent] shutting down...");
}
