/**
 * Seeds a full ~2-minute demo session (warmup -> focused -> zone-out ->
 * breathing-guide intervention -> recovery -> thought probe) into whatever
 * Tiger Cloud instance TIGER_CLOUD_URL points at, going through the real
 * running API (not direct SQL) so it exercises the actual ingest path.
 *
 * Source data: apps/agent/demo-data/session-01.jsonl (Lane A's curated
 * WsMessage narrative, `{ atMs, message }` per line). This script re-bases
 * each `atMs` onto a real wall-clock timestamp ending near "now" and posts
 * it through POST /v1/sessions -> POST /v1/sessions/:id/batch -> POST
 * /v1/sessions/:id/end, exactly like the agent would.
 *
 * Usage: pnpm --filter @flow/api exec tsx scripts/seed-demo.ts
 * Env:   API_BASE_URL (default http://localhost:3001)
 */
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import type {
  AppContextMessage,
  SampleMessage,
  ThoughtProbeMessage,
  WsMessage,
} from "@flow/shared";
import { createPool } from "../src/db/pool.js";

const API_BASE_URL = process.env["API_BASE_URL"] ?? "http://localhost:3001";
const DEVICE_ID = process.env["DEMO_DEVICE_ID"] ?? "demo-device";

const scriptDir = dirname(fileURLToPath(import.meta.url));
const demoDataPath = join(scriptDir, "..", "..", "agent", "demo-data", "session-01.jsonl");

interface Entry {
  atMs: number;
  message: WsMessage;
}

function loadDemoEntries(): Entry[] {
  const raw = readFileSync(demoDataPath, "utf8");
  return raw
    .split("\n")
    .filter((line) => line.trim().length > 0)
    .map((line) => JSON.parse(line) as Entry);
}

async function postJson<T>(path: string, body: unknown): Promise<T> {
  const res = await fetch(`${API_BASE_URL}${path}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    throw new Error(`POST ${path} failed: ${res.status} ${await res.text()}`);
  }
  return (await res.json()) as T;
}

async function main() {
  const entries = loadDemoEntries();
  const maxAtMs = Math.max(...entries.map((e) => e.atMs));
  // Re-base so the session's last event lands ~now, making it show up as
  // "just happened" in the dashboard's recency sort.
  const baseTs = Date.now() - maxAtMs;

  const samples: SampleMessage[] = [];
  const events: { ts: number; kind: string; payload: unknown }[] = [];
  const contexts: AppContextMessage[] = [];
  const probes: ThoughtProbeMessage[] = [];

  for (const { atMs, message } of entries) {
    const ts = baseTs + atMs;
    switch (message.kind) {
      case "sample":
        samples.push({ ...message, ts });
        break;
      case "state":
        events.push({ ts, kind: "state", payload: { state: message.state, reasons: message.reasons, confidence: message.confidence } });
        break;
      case "alert":
        events.push({ ts, kind: "alert", payload: { type: message.type, reasons: message.reasons, duration_s: message.duration_s } });
        break;
      case "breathing_guide":
        events.push({ ts, kind: "breathing_guide", payload: { phase: message.phase, duration_ms: message.duration_ms, measured_rpm: message.measured_rpm, ie_ratio: message.ie_ratio } });
        break;
      case "app_context":
        contexts.push({ ...message, ts });
        break;
      case "thought_probe":
        probes.push({ ...message, ts });
        break;
      default:
        break;
    }
  }

  console.log(`[seed-demo] loaded ${entries.length} entries (${samples.length} samples) from ${demoDataPath}`);

  const { sessionId } = await postJson<{ sessionId: string }>("/v1/sessions", { deviceId: DEVICE_ID });
  console.log(`[seed-demo] created session ${sessionId}`);

  // POST /v1/sessions always stamps started_at = now(). Back-date it to the
  // demo's real start so /end's `duration_s = now() - started_at` comes out
  // matching the ~2 minutes of sample data instead of however long this
  // script took to run.
  const pool = createPool();
  await pool.query("UPDATE sessions SET started_at = $1 WHERE id = $2", [new Date(baseTs), sessionId]);

  const batchResult = await postJson(`/v1/sessions/${sessionId}/batch`, {
    batchKey: crypto.randomUUID(),
    samples,
    events,
    contexts,
    probes,
  });
  console.log(`[seed-demo] batch inserted:`, batchResult);

  // samples_1min/5min are continuous aggregates that otherwise only refresh
  // on their own schedule (every 1min/5min, per infra/migrations/002). Force
  // a refresh so the dashboard's ribbon/timeline show this data immediately.
  await pool.query("CALL refresh_continuous_aggregate('samples_1min', NULL, NULL)");
  await pool.query("CALL refresh_continuous_aggregate('samples_5min', NULL, NULL)");
  await pool.end();

  const endResult = await postJson(`/v1/sessions/${sessionId}/end`, {});
  console.log(`[seed-demo] session ended:`, endResult);

  console.log(`\n[seed-demo] done — view it at ${API_BASE_URL}/v1/sessions/${sessionId}`);
}

main().catch((err) => {
  console.error("[seed-demo] failed:", err);
  process.exit(1);
});
