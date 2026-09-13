#!/usr/bin/env node
// Pre-demo smoke test: automates every part of "agent connects to API, a
// session can be started, data lands in the DB, dashboard shows it" that
// doesn't require a real webcam, then prints the manual checklist for the
// part that does (a fully headless E2E test isn't possible here -- the
// SmartSpectra SDK needs a real camera).
//
// Requires apps/api + apps/web already running (`pnpm dev:all` in another
// terminal). Run with: `pnpm smoke`
import { spawnSync } from "node:child_process";
import { checkEnv } from "./check-env.mjs";

const API_BASE_URL = process.env.API_BASE_URL ?? "http://localhost:3001";
const WEB_BASE_URL = process.env.WEB_BASE_URL ?? "http://localhost:3000";

function heading(text) {
  console.log(`\n── ${text} ──`);
}

let failed = false;

heading("1/4 Environment");
const { ok } = checkEnv();
if (!ok) failed = true;

heading("2/4 API reachable");
try {
  const res = await fetch(`${API_BASE_URL}/v1/health`);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  console.log(`OK  ${API_BASE_URL}/v1/health -> ${JSON.stringify(await res.json())}`);
} catch (err) {
  console.error(`FAIL  Could not reach ${API_BASE_URL}/v1/health -- is the api running? (pnpm dev:all)`);
  console.error(`      ${err.message}`);
  failed = true;
}

heading("3/4 Web reachable");
try {
  // /dashboard rather than "/" -- Next's dev server can 404 the root for a
  // moment during its first-ever compile, while an actual app route is a
  // more reliable readiness signal (and the page a demo actually uses).
  const res = await fetch(`${WEB_BASE_URL}/dashboard`);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  console.log(`OK  ${WEB_BASE_URL}/dashboard -> HTTP ${res.status}`);
} catch (err) {
  console.error(`FAIL  Could not reach ${WEB_BASE_URL}/dashboard -- is the web app running? (pnpm dev:all)`);
  console.error(`      ${err.message}`);
  failed = true;
}

if (failed) {
  console.error("\nFix the above, then re-run `pnpm smoke`. Skipping the data-path check.");
  process.exit(1);
}

heading("4/4 End-to-end data path (session -> batch -> Tiger Cloud -> aggregate)");
console.log("Replaying the curated demo session through the real API (apps/api/scripts/seed-demo.ts)...\n");
const seed = spawnSync("pnpm", ["--filter", "@flow/api", "exec", "tsx", "scripts/seed-demo.ts"], {
  stdio: "inherit",
  shell: true,
  env: { ...process.env, API_BASE_URL, DEMO_DEVICE_ID: process.env.DEMO_DEVICE_ID ?? "smoke-test" },
});
if (seed.status !== 0) {
  console.error("\nFAIL  seed-demo.ts failed -- see output above (commonly a bad/missing TIGER_CLOUD_URL).");
  process.exit(1);
}

console.log("\nAutomated checks passed.");
console.log(`Open ${WEB_BASE_URL}/dashboard and confirm a "smoke-test" session appears with a populated timeline.\n`);

console.log("── Manual checklist (needs a real webcam -- not automatable) ──");
console.log(`
  [ ] Start the agent against a real webcam: run.bat (repo root)
      -- it opens the deployed session page after the camera launch check.
  [ ] Open ${WEB_BASE_URL}/session for local UI testing and confirm:
        - the pulse/breathing waveform starts rendering within ~20s
        - the state badge moves out of "warmup"
  [ ] Let it run long enough to trigger a zone-out alert, or use
      run-demo.bat instead to replay a pre-recorded session on a fixed
      script if you don't want to wait on a real detection.
  [ ] Confirm the alert fires in the UI (and audio, if ELEVENLABS_API_KEY
      is set).
  [ ] End the session, then open ${WEB_BASE_URL}/dashboard and confirm the
      real session (not "smoke-test") appears with a populated timeline
      and narrative.
`);
