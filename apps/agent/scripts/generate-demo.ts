/**
 * One-off generator for the demo-mode capture (R012). Produces a curated
 * ~2-minute narrative — warmup, focused work, a zone-out episode with
 * intervention, recovery, and a thought probe — as JSONL entries
 * `{ atMs, message }` that DemoEmitter replays verbatim through the same
 * WebSocket contract as the live/mock paths.
 *
 * Run once with: npx tsx scripts/generate-demo.ts
 * Output: demo-data/session-01.jsonl (checked in — this is the artifact,
 * not something regenerated on every build).
 */
import { writeFileSync, mkdirSync } from "node:fs";
import { DetectionStatus, State, Category } from "@flow/shared";
import type { WsMessage } from "@flow/shared";

interface Entry {
  atMs: number;
  message: WsMessage;
}

const entries: Entry[] = [];
function at(atMs: number, message: WsMessage) {
  entries.push({ atMs, message });
}

const TOTAL_MS = 120_000;
const SAMPLE_INTERVAL_MS = 50; // 20Hz

// Narrative windows
const WARMUP_END = 3_000;
const ZONE_OUT_START = 45_000;
const ZONE_OUT_ALERT_AT = 90_000;
const RECOVERY_AT = 105_000;

// ── Scripted non-sample events ───────────────────────────────────────

at(0, { kind: "state", state: State.Warmup, reasons: ["baseline_calibration"], confidence: 1, ts: 0 });
at(200, { kind: "app_context", app_title: "Notion — Thesis Draft", category: Category.Study, ts: 200 });
at(WARMUP_END, { kind: "state", state: State.Focused, reasons: ["warmup_complete"], confidence: 1, ts: WARMUP_END });

at(ZONE_OUT_START, {
  kind: "state",
  state: State.ZonedOut,
  reasons: ["elevated_blink_rate", "hrv_drop", "eda_drop"],
  confidence: 0.8,
  ts: ZONE_OUT_START,
});
at(ZONE_OUT_ALERT_AT, {
  kind: "alert",
  type: "zone_out",
  reasons: ["elevated_blink_rate", "hrv_drop", "eda_drop"],
  ts: ZONE_OUT_ALERT_AT,
  duration_s: Math.round((ZONE_OUT_ALERT_AT - ZONE_OUT_START) / 1000),
});

// Breathing guide: 3 cycles at ~12 RPM, ie_ratio 1.5 -> cycle 5000ms,
// inhale 2000ms, exhale 3000ms (mirrors breathing-guide.ts defaults)
let guideT = ZONE_OUT_ALERT_AT;
const INHALE_MS = 2000;
const EXHALE_MS = 3000;
for (let cycle = 0; cycle < 3; cycle++) {
  at(guideT, { kind: "breathing_guide", phase: "inhale", duration_ms: INHALE_MS, measured_rpm: 12, ie_ratio: 1.5, });
  guideT += INHALE_MS;
  at(guideT, { kind: "breathing_guide", phase: "exhale", duration_ms: EXHALE_MS, measured_rpm: 12, ie_ratio: 1.5 });
  guideT += EXHALE_MS;
}

at(RECOVERY_AT, { kind: "state", state: State.Focused, reasons: ["signals_normal"], confidence: 0.85, ts: RECOVERY_AT });
at(110_000, { kind: "thought_probe", ts: 110_000, classifier_state: State.Focused, user_response: "focused" });

// ── Sample stream (20Hz throughout) ──────────────────────────────────

let blinkState = false;
let lastBlinkToggle = 0;

for (let t = 0; t <= TOTAL_MS; t += SAMPLE_INTERVAL_MS) {
  const elapsed = t / 1000;
  const inZoneOut = t >= ZONE_OUT_START && t < RECOVERY_AT;

  const pulseDrift = Math.sin(elapsed * 0.1) * 6;
  const breathDrift = Math.sin(elapsed * 0.07) * 2;
  const hrvDrift = Math.sin(elapsed * 0.05) * 8;

  // Faster blink toggling during zone-out (elevated blink rate signature)
  const toggleInterval = inZoneOut ? 1.2 + Math.random() * 1 : 3 + Math.random() * 3;
  if (elapsed - lastBlinkToggle > toggleInterval) {
    blinkState = !blinkState;
    lastBlinkToggle = elapsed;
  }

  // HRV/EDA dip during zone-out (arousal drop signature)
  const hrvBase = inZoneOut ? 42 - 10 : 42;
  const edaBase = inZoneOut ? 2.5 - 0.4 : 2.5;

  const sample: WsMessage = {
    kind: "sample",
    ts: t,
    pulse_bpm: round(72 + pulseDrift + jitter(2)),
    breathing_rpm: round(15 + breathDrift + jitter(0.5)),
    hrv_ms: round(hrvBase + hrvDrift + jitter(3)),
    eda_us: round(edaBase + Math.sin(elapsed * 0.03) * 0.3 + jitter(0.15), 2),
    conf: round(0.85 + Math.sin(elapsed * 0.02) * 0.08, 3),
    blink: blinkState ? DetectionStatus.Detected : DetectionStatus.NotDetected,
    talking: DetectionStatus.NotDetected,
    landmarks: null,
    expressions: null,
  };
  at(t, sample);
}

function jitter(mag: number): number {
  return (Math.random() - 0.5) * mag;
}
function round(n: number, dp = 1): number {
  const f = 10 ** dp;
  return Math.round(n * f) / f;
}

// ── Write ─────────────────────────────────────────────────────────────

entries.sort((a, b) => a.atMs - b.atMs);
mkdirSync("demo-data", { recursive: true });
writeFileSync(
  "demo-data/session-01.jsonl",
  entries.map((e) => JSON.stringify(e)).join("\n") + "\n"
);
console.log(`[generate-demo] wrote ${entries.length} entries to demo-data/session-01.jsonl`);
