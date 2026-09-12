/**
 * Structured console logger for the agent.
 * Formats output so it's readable in a terminal / run.bat window.
 */

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
