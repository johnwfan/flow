#!/usr/bin/env node
// Single entry point for local dev: checks env vars up front, then runs
// apps/api and apps/web together (labeled, interleaved output via turbo's
// stream UI; Ctrl+C stops both).
//
// The agent is deliberately NOT started here -- it binds a real webcam via
// the SmartSpectra native SDK, so it must stay a separate, visible step the
// developer runs by hand (run.bat / run-demo.bat). See docs/RUNNING.md.
import { spawn } from "node:child_process";
import { checkEnv } from "./check-env.mjs";

const apiPort = process.env.PORT ?? 3001;
const webPort = 3000;

console.log("=".repeat(64));
console.log("  Flow dev -- starting api + web");
console.log("=".repeat(64));

const { ok } = checkEnv();
if (!ok) {
  console.error("Fix the required variable(s) above, then re-run `pnpm dev:all`.\n");
  process.exit(1);
}

console.log(`  web  -> http://localhost:${webPort}`);
console.log(`  api  -> http://localhost:${apiPort}  (health check: /v1/health)`);
console.log("");
console.log("  Agent (real webcam) is NOT started by this script -- run it");
console.log("  separately: run.bat (live camera) or run-demo.bat (replay).");
console.log("");
console.log('  Watch below for "Ready" (web) and "API listening" (api) to');
console.log("  know when each is actually up.");
console.log("=".repeat(64) + "\n");

// shell:true so `pnpm` resolves the same way on Windows (pnpm.cmd via
// PATHEXT) and POSIX shells without branching the spawn call per platform.
const child = spawn(
  "pnpm",
  ["exec", "turbo", "run", "dev", "--filter=@flow/api", "--filter=@flow/web", "--ui=stream"],
  { stdio: "inherit", shell: true },
);

child.on("exit", (code) => process.exit(code ?? 0));
for (const sig of ["SIGINT", "SIGTERM"]) {
  process.on(sig, () => child.kill(sig));
}
