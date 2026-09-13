import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import dotenv from "dotenv";
import { AgentWsServer } from "./ws-server.js";
import { MockEmitter } from "./mock-emitter.js";
import { SdkAdapter } from "./sdk-adapter.js";
import { DemoEmitter } from "./demo-emitter.js";
import { Session } from "./session.js";
import { Pipeline } from "./pipeline.js";
import { ApiClient } from "./api-client.js";
import { UploadScheduler } from "./upload-scheduler.js";
import { initFileLogging, logBanner, logConfig, logSample, logShutdown } from "./logger.js";
import type { SampleMessage, StateMessage, WsMessage } from "@flow/shared";

// ── Env ────────────────────────────────────────────────────────────
// Resolve .env relative to this file (apps/agent/.env), not process.cwd(),
// so it loads the same whether launched via run.bat (cwd = repo root),
// `pnpm dev:real` (cwd = apps/agent), or `node dist/index.js`.
const scriptDir = dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: join(scriptDir, "..", ".env") });

// Rotating file log (R011) — before any other console output so the whole
// run is captured, including startup.
initFileLogging(join(scriptDir, "..", "logs"));

// ── CLI args ───────────────────────────────────────────────────────
const args = process.argv.slice(2);

if (args.includes("--help") || args.includes("-h")) {
  console.log("Usage: flow-agent [options]");
  console.log("");
  console.log("Options:");
  console.log("  --mock         Use mock emitter (default)");
  console.log("  --real         Use SmartSpectra SDK with real camera");
  console.log("  --demo [file]  Replay a pre-recorded JSONL capture (default: demo-data/session-01.jsonl)");
  console.log("  --port <n>     WebSocket port (default: 8765)");
  console.log("  --camera <n>   Camera device index (default: 0)");
  console.log("  --help, -h     Show this help");
  process.exit(0);
}

const useReal = args.includes("--real");
const demoIdx = args.indexOf("--demo");
const useDemo = demoIdx >= 0;
const demoNextArg = useDemo ? args[demoIdx + 1] : undefined;
const demoPath =
  demoNextArg && !demoNextArg.startsWith("--")
    ? demoNextArg
    : join(scriptDir, "..", "demo-data", "session-01.jsonl");
const portIdx = args.indexOf("--port");
const port = portIdx >= 0 ? parseInt(args[portIdx + 1]!, 10) : 8765;
const camIdx = args.indexOf("--camera");
const cameraIndex = camIdx >= 0 ? parseInt(args[camIdx + 1]!, 10) : 0;

// ── Session (constructed first — its deviceId is needed below) ────
const session = new Session({
  onStateChange: (state: StateMessage) => {
    broadcastAndRecord(state);
  },
  onWarmupComplete: () => {
    pipeline.onWarmupComplete();
  },
});

// ── API persistence (R006) ────────────────────────────────────────
// Best-effort: if the API is unreachable, the session just isn't
// persisted — live WS clients (the session page) are unaffected either
// way, since they read straight off the broadcasts below.
const apiClient = new ApiClient({
  baseUrl: process.env.API_BASE_URL ?? "http://localhost:3001",
  deviceId: session.deviceId,
  spillDir: join(scriptDir, "..", "spill"),
});
let currentSessionId: string | null = null;
const uploadScheduler = new UploadScheduler(
  apiClient,
  () => currentSessionId,
  () => pipeline.uploadBuffer.drain()
);

// Every broadcast also feeds the upload accumulator (samples excluded —
// those come from pipeline.uploadBuffer at flush time instead).
function broadcastAndRecord(msg: WsMessage): void {
  server.broadcast(msg);
  uploadScheduler.record(msg);
}

// ── Pipeline (classifier, baseline, window tracker, probes) ───────
const pipeline = new Pipeline({
  broadcast: broadcastAndRecord,
});

// ── WebSocket server ───────────────────────────────────────────────
const server = new AgentWsServer({
  port,
  onSessionControl: (msg) => {
    if (useDemo) {
      // Demo mode replays pre-classified messages verbatim — it bypasses
      // session warmup/pipeline entirely rather than re-deriving state.
      if (msg.action === "start") {
        startDemo();
      } else if (msg.action === "end" || msg.action === "pause") {
        demoEmitter?.stop();
      } else if (msg.action === "resume") {
        startDemo();
      }
      return;
    }

    // Capture phase BEFORE handleControl mutates it — a redundant "start"
    // while already running must not register a second orphan session
    // (session.start() itself is idempotent-safe and just warns+no-ops,
    // but apiClient.startSession() has no such guard, so we gate it here).
    const wasIdle = msg.action === "start" && (session.phase === "idle" || session.phase === "ended");

    session.handleControl(msg);

    if (msg.action === "start") {
      pipeline.startTracking();
      startEmitting();
      if (wasIdle) {
        // Register the session with the API in the background — don't
        // block sensing/broadcast on it. If it fails, currentSessionId
        // stays null and UploadScheduler drops accumulated data rather
        // than growing unboundedly (live WS clients already got
        // everything either way).
        void apiClient.startSession().then((id) => {
          currentSessionId = id;
          if (id) uploadScheduler.start();
        });
      }
    } else if (msg.action === "end") {
      stopEmitting();
      pipeline.stop();
      uploadScheduler.stop();
      if (currentSessionId) {
        const idToClose = currentSessionId;
        currentSessionId = null;
        void apiClient.endSession(idToClose);
      }
    } else if (msg.action === "pause") {
      stopEmitting();
      uploadScheduler.record(msg);
    } else if (msg.action === "resume") {
      startEmitting();
      uploadScheduler.record(msg);
    }
  },
});

// ── Sample handler ─────────────────────────────────────────────────
function handleSample(sample: SampleMessage): void {
  if (!session.shouldEmit) return;

  // Route through pipeline (baseline → classifier → alerts)
  pipeline.processSample(sample);

  // Broadcast to WS clients
  server.broadcast(sample);
  logSample();
}

// ── Emitter setup ──────────────────────────────────────────────────
let mockEmitter: MockEmitter | null = null;
let sdkAdapter: SdkAdapter | null = null;
let demoEmitter: DemoEmitter | null = null;

function startDemo(): void {
  if (!demoEmitter) {
    demoEmitter = new DemoEmitter(demoPath, (msg) => server.broadcast(msg));
  }
  try {
    demoEmitter.start();
  } catch (err: any) {
    console.error(`[demo] failed to start: ${err.message}`);
  }
}

// Broadcast a fatal camera/SDK failure so the live session page can be
// honest about it (edge state + reload prompt) instead of silently
// swapping to mock data mid-session without saying so.
function broadcastCameraRefused(reason: string): void {
  server.broadcastRaw({ kind: "debug_error", fatal: true, reason, ts: Date.now() });
}

// ── Camera auto-probe ────────────────────────────────────────────────
// `--camera <n>` (or its default) is a guess: SmartSpectra's device index
// doesn't necessarily match Windows' device order, and whatever webcam it
// was last tuned for may not even be plugged in anymore. Rather than fail
// once and quietly run the classifier on frozen fallback numbers, cycle
// through a small set of candidate indices — the requested one first, then
// 0-3 — retrying each once (a real driver hiccup is often transient) before
// moving on. Only give up (fall back to mock) once every candidate fails.
const cameraCandidates = Array.from(new Set([cameraIndex, 0, 1, 2, 3]));
let cameraCandidatePos = 0;
let cameraAttempts = 0;
const MAX_CAMERA_ATTEMPTS = cameraCandidates.length * 2;

// A camera can open with no error at all and still be the WRONG one --
// e.g. index 0 happens to be a built-in laptop camera that isn't pointed
// at anyone (lid angle, privacy shutter, docked setup) while the actual
// USB webcam sits at a different index. "Opened without throwing" isn't
// proof it's usable, so track whether SmartSpectra has actually confirmed
// a face on the current candidate, and if it hasn't within a short search
// window, treat that the same as a hard failure and move to the next
// candidate. A single kOk (0) isn't enough proof by itself -- the SDK
// fires one immediately on open, before it's evaluated a real frame, so
// require several *consecutive* kOk frames (real sustained detection is
// continuous at capture framerate; a startup blip is not).
let faceFoundOnCurrentCamera = false;
let consecutiveOkFrames = 0;
const CONFIRM_OK_FRAMES = 10;
let faceSearchTimer: NodeJS.Timeout | null = null;
const FACE_SEARCH_WINDOW_MS = 12_000;

function clearFaceSearchTimer(): void {
  if (faceSearchTimer) {
    clearTimeout(faceSearchTimer);
    faceSearchTimer = null;
  }
}

/** Give up on the current candidate index and try the next one (or mock if exhausted). */
function tryNextCamera(reason: string): void {
  clearFaceSearchTimer();
  cameraAttempts++;
  if (cameraAttempts > MAX_CAMERA_ATTEMPTS) {
    console.error(
      `[agent] camera unusable on every candidate index (${cameraCandidates.join(", ")}) — falling back to mock`
    );
    broadcastCameraRefused(
      `no working camera found (tried device index ${cameraCandidates.join(", ")})`
    );
    startMock();
    return;
  }
  cameraCandidatePos = (cameraCandidatePos + 1) % cameraCandidates.length;
  const nextIndex = cameraCandidates[cameraCandidatePos]!;
  console.warn(
    `[agent] ${reason} — trying device index ${nextIndex} instead (attempt ${cameraAttempts}/${MAX_CAMERA_ATTEMPTS})`
  );
  const adapter = sdkAdapter;
  if (!adapter) return;
  faceFoundOnCurrentCamera = false; // unproven on the new candidate
  consecutiveOkFrames = 0;
  adapter.stop().finally(() => {
    adapter.setCameraIndex(nextIndex);
    adapter.start();
    armFaceSearchTimer();
  });
}

/**
 * Arms the "did this camera ever find a face" watchdog. A no-op once a
 * face has actually been confirmed on the current camera — pausing and
 * resuming (e.g. stepping away briefly) shouldn't re-trigger a search
 * away from a camera already known to work.
 */
function armFaceSearchTimer(): void {
  if (faceFoundOnCurrentCamera) return;
  clearFaceSearchTimer();
  faceSearchTimer = setTimeout(() => {
    if (faceFoundOnCurrentCamera) return;
    tryNextCamera(`camera opened but found no face within ${FACE_SEARCH_WINDOW_MS / 1000}s`);
  }, FACE_SEARCH_WINDOW_MS);
}

async function startEmitting(): Promise<void> {
  if (useReal) {
    if (!sdkAdapter) {
      const apiKey = process.env.SMARTSPECTRA_API_KEY;
      if (!apiKey) {
        console.error("[agent] SMARTSPECTRA_API_KEY not set — falling back to mock");
        broadcastCameraRefused("SMARTSPECTRA_API_KEY not set");
        startMock();
        return;
      }
      sdkAdapter = new SdkAdapter({
        apiKey,
        cameraIndex,
        onSample: handleSample,
        onValidation: (code, hint) => {
          if (code === 0) {
            consecutiveOkFrames++;
            if (!faceFoundOnCurrentCamera && consecutiveOkFrames >= CONFIRM_OK_FRAMES) {
              // Sustained kOk, not just the one-off blip the SDK fires on
              // open before it's evaluated a real frame -- lock in this
              // camera and stop searching for a "better" one.
              console.log(`[agent] camera confirmed (${CONFIRM_OK_FRAMES} consecutive good frames)`);
              faceFoundOnCurrentCamera = true;
              clearFaceSearchTimer();
            }
            return;
          }
          consecutiveOkFrames = 0;
          // Diagnostic-only, outside the frozen WsMessage contract
          server.broadcastRaw({ kind: "debug_validation", code, hint, ts: Date.now() });
        },
        onError: (code, message, retryable) => {
          if (!retryable) {
            broadcastCameraRefused(message);
            return;
          }
          tryNextCamera(`camera start failed (${message})`);
        },
      });
      const ok = await sdkAdapter.init();
      if (!ok) {
        console.warn("[agent] SDK init failed — falling back to mock");
        broadcastCameraRefused("camera or SDK failed to initialize");
        sdkAdapter = null;
        startMock();
        return;
      }
    }
    sdkAdapter.start();
    armFaceSearchTimer();
  } else {
    startMock();
  }
}

function startMock(): void {
  if (!mockEmitter) {
    mockEmitter = new MockEmitter(handleSample);
  }
  mockEmitter.start();
}

function stopEmitting(): void {
  clearFaceSearchTimer();
  if (mockEmitter?.isRunning) {
    mockEmitter.stop();
  }
  if (sdkAdapter) {
    sdkAdapter.stop().catch((err) => console.error("[agent] SDK stop error:", err));
  }
}

// ── Crash safety net ──────────────────────────────────────────────
// The native SmartSpectra binding can throw synchronously from
// unexpected callback paths (camera contention, driver hiccups). Losing
// the whole agent mid-demo is worse than losing one bad frame — log and
// keep running rather than let an uncaught native error kill the process.
process.on("uncaughtException", (err) => {
  console.error(`[agent] uncaught exception (continuing): ${err.message}`);
});
process.on("unhandledRejection", (reason) => {
  console.error(`[agent] unhandled rejection (continuing): ${reason}`);
});

// ── Startup ────────────────────────────────────────────────────────
logBanner();
logConfig({
  mode: useDemo
    ? `demo (replay: ${demoPath})`
    : useReal
      ? "real (SmartSpectra SDK)"
      : "mock (synthetic 20Hz)",
  port,
  deviceId: session.deviceId,
});

console.log("[agent] ready — waiting for session_control start message");

// ── Shutdown ───────────────────────────────────────────────────────
async function shutdown(): Promise<void> {
  logShutdown();
  demoEmitter?.stop();
  stopEmitting();
  pipeline.stop();
  uploadScheduler.stop();
  if (currentSessionId) {
    uploadScheduler.flush();
    await apiClient.endSession(currentSessionId);
  }
  if (sdkAdapter) await sdkAdapter.destroy();
  await server.close();
  process.exit(0);
}

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
