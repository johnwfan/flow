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
import { buildCameraPlan, describeCameraPlan, rememberCameraChoice } from "./camera-plan.js";
import { acquireSingleInstance } from "./single-instance.js";
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
  console.log("  --camera <n>   Try this SmartSpectra camera device index first");
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
const requestedCameraIndex = camIdx >= 0 ? parseInt(args[camIdx + 1]!, 10) : null;

let instanceLock: ReturnType<typeof acquireSingleInstance> | null = null;
try {
  instanceLock = acquireSingleInstance(join(scriptDir, "..", "logs", "flow-agent.lock"));
} catch (err: any) {
  console.error(`[agent] ${err.message}`);
  console.error("[agent] close the existing Flow Agent window before starting another one.");
  process.exit(1);
}

const cameraPlan = buildCameraPlan({
  cachePath: join(scriptDir, "..", "logs", "camera-preferences.json"),
  requestedIndex: requestedCameraIndex,
});
const initialCameraIndex = cameraPlan.candidates[0] ?? 0;

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
let currentSessionStart: Promise<string | null> | null = null;
let closingPersistedSession = false;
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

function startPersistedSession(): void {
  closingPersistedSession = false;
  const start = apiClient.startSession();
  currentSessionStart = start;

  void start.then((id) => {
    if (currentSessionStart !== start) return;
    currentSessionStart = null;
    currentSessionId = id;
    if (id && !closingPersistedSession) uploadScheduler.start();
  });
}

async function endPersistedSession(): Promise<void> {
  closingPersistedSession = true;
  uploadScheduler.stop();

  const pendingStart = currentSessionStart;
  const startedId = pendingStart ? await pendingStart : currentSessionId;
  if (currentSessionStart === pendingStart) currentSessionStart = null;

  const idToClose = currentSessionId ?? startedId;
  if (!idToClose) {
    await uploadScheduler.flush();
    closingPersistedSession = false;
    return;
  }

  currentSessionId = idToClose;
  await uploadScheduler.flush();
  currentSessionId = null;
  await apiClient.endSession(idToClose);
  closingPersistedSession = false;
}

// ── Pipeline (classifier, baseline, window tracker, probes) ───────
const pipeline = new Pipeline({
  broadcast: broadcastAndRecord,
});

// ── WebSocket server ───────────────────────────────────────────────
const server = new AgentWsServer({
  port,
  onServerError: (err) => {
    if (err.code === "EADDRINUSE") {
      console.error(`[agent] port ${port} is already in use by another Flow agent`);
      process.exit(1);
    }
  },
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
    const isPreflight = msg.session_id.startsWith("preflight-");

    session.handleControl(msg);

    if (msg.action === "start") {
      pipeline.startTracking();
      startEmitting({ freshSession: wasIdle });
      if (wasIdle && !isPreflight) {
        // Register the session with the API in the background, but remember
        // the promise so a quick End can still wait for the real persisted id.
        startPersistedSession();
      } else if (isPreflight) {
        console.log(`[preflight] started ${msg.session_id}`);
      }
    } else if (msg.action === "end") {
      stopEmitting();
      pipeline.stop();
      if (!isPreflight) {
        void endPersistedSession();
      } else if (isPreflight) {
        console.log(`[preflight] ended ${msg.session_id}`);
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
  if (useReal && sampleLooksReal(sample)) {
    samplesOnCurrentCamera++;
    maybeConfirmCurrentCamera();
  }

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
// SmartSpectra's Node SDK opens cameras by numeric device index, while the
// demo setup is described by Windows device name ("HD Webcam"). Build an
// index order from the requested index/env/cache plus a Windows inventory,
// then prove the selected index with validation frames and decoded samples.
const cameraCandidates = cameraPlan.candidates;
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
// candidate. A single kOk (0) isn't enough proof by itself -- the SDK can
// fire one before metrics are flowing, so require sustained face evidence
// plus decoded samples from the current index.
let faceFoundOnCurrentCamera = false;
let consecutiveFaceFrames = 0;
let samplesOnCurrentCamera = 0;
const CONFIRM_FACE_FRAMES = 10;
const CONFIRM_REAL_SAMPLES = 3;
let faceSearchTimer: NodeJS.Timeout | null = null;
const FACE_SEARCH_WINDOW_MS = 12_000;

// SmartSpectra reports a timestamp gap (SmartSpectraErrorCode.kTimestampGap
// = 11) as a fatal, non-retryable error when delivered camera frames stall
// or arrive late enough to break its timing assumptions -- usually a
// camera/USB hiccup (see sdk-adapter.ts's useCamera() comment), not proof
// the device is unusable. The SDK's own "retryable" flag says no, but in
// practice a plain reset+restart on the SAME index recovers fine, so this
// is treated as retryable at the agent level, capped so a genuinely
// unstable camera still eventually falls back to mock instead of retrying
// forever.
const TIMESTAMP_GAP_ERROR_CODE = 11;
let timestampGapRetries = 0;
const MAX_TIMESTAMP_GAP_RETRIES = 5;
// If a restart stays up this long without another gap error, treat the
// camera as genuinely stable again and forgive earlier retries -- a rare
// hiccup an hour into a session shouldn't count against the same cap as a
// camera that's fundamentally unable to hold a framerate.
const GAP_STABILITY_MS = 30_000;
let gapStabilityTimer: NodeJS.Timeout | null = null;

/** Restart capture on the SAME camera index -- for a transient pipeline
 * hiccup, not evidence this is the wrong device (unlike tryNextCamera). */
function restartCurrentCamera(reason: string): void {
  const adapter = sdkAdapter;
  if (!adapter) return;
  console.warn(`[agent] ${reason} — restarting capture on the same camera`);
  adapter.stop().finally(() => {
    adapter.start();
    // Only re-arm the face search if this camera hadn't already proven
    // itself -- a mid-session hiccup on an already-confirmed camera
    // shouldn't restart the "is this even the right camera" search.
    if (!faceFoundOnCurrentCamera) armFaceSearchTimer();
    if (gapStabilityTimer) clearTimeout(gapStabilityTimer);
    gapStabilityTimer = setTimeout(() => {
      timestampGapRetries = 0;
    }, GAP_STABILITY_MS);
  });
}

function sampleLooksReal(sample: SampleMessage): boolean {
  return (
    sample.pulse_bpm != null ||
    sample.breathing_rpm != null ||
    sample.hrv_ms != null ||
    sample.eda_us != null ||
    sample.conf != null ||
    sample.landmarks != null
  );
}

function validationMeansFaceVisible(code: number): boolean {
  // kNoFaceFound is the one status that clearly says the current index is
  // pointed away from the user. Other validation states can still be the
  // right camera with imperfect framing/lighting.
  return code !== 1;
}

function resetCameraEvidence(): void {
  faceFoundOnCurrentCamera = false;
  consecutiveFaceFrames = 0;
  samplesOnCurrentCamera = 0;
}

function resetCameraSearchForFreshSession(): void {
  if (faceFoundOnCurrentCamera) return;
  clearFaceSearchTimer();
  cameraCandidatePos = 0;
  cameraAttempts = 0;
  timestampGapRetries = 0;
  resetCameraEvidence();
  sdkAdapter?.setCameraIndex(cameraCandidates[0] ?? initialCameraIndex);
}

function maybeConfirmCurrentCamera(): void {
  if (faceFoundOnCurrentCamera) return;
  if (consecutiveFaceFrames < CONFIRM_FACE_FRAMES || samplesOnCurrentCamera < CONFIRM_REAL_SAMPLES) {
    return;
  }
  const index = cameraCandidates[cameraCandidatePos]!;
  console.log(
    `[agent] camera confirmed on device index ${index} (${consecutiveFaceFrames} validation frames, ${samplesOnCurrentCamera} samples)`
  );
  faceFoundOnCurrentCamera = true;
  clearFaceSearchTimer();
  rememberCameraChoice(cameraPlan, index);
  server.broadcastRaw({
    kind: "debug_camera",
    deviceIndex: index,
    preferredName: cameraPlan.preferredName,
    ts: Date.now(),
  });
}

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
  resetCameraEvidence();
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

async function startEmitting({ freshSession = false }: { freshSession?: boolean } = {}): Promise<void> {
  if (useReal) {
    if (freshSession) {
      resetCameraSearchForFreshSession();
    }
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
        cameraIndex: initialCameraIndex,
        onSample: handleSample,
        onValidation: (code, hint) => {
          if (validationMeansFaceVisible(code)) {
            consecutiveFaceFrames++;
            maybeConfirmCurrentCamera();
          } else {
            consecutiveFaceFrames = 0;
          }
          // Diagnostic-only, outside the frozen WsMessage contract
          if (code !== 0) {
            server.broadcastRaw({ kind: "debug_validation", code, hint, ts: Date.now() });
          }
        },
        onError: (code, message, retryable) => {
          if (code === TIMESTAMP_GAP_ERROR_CODE) {
            if (gapStabilityTimer) {
              clearTimeout(gapStabilityTimer);
              gapStabilityTimer = null;
            }
            timestampGapRetries++;
            if (timestampGapRetries > MAX_TIMESTAMP_GAP_RETRIES) {
              console.error(
                `[agent] repeated frame-timing errors (${timestampGapRetries}) -- this camera can't sustain a stable framerate here, falling back to mock`
              );
              broadcastCameraRefused(`camera kept losing frame sync (${message})`);
              startMock();
              return;
            }
            restartCurrentCamera(`frame-timing error (${message}) (attempt ${timestampGapRetries}/${MAX_TIMESTAMP_GAP_RETRIES})`);
            return;
          }
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
  if (gapStabilityTimer) {
    clearTimeout(gapStabilityTimer);
    gapStabilityTimer = null;
  }
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
console.log(`[agent] single-instance lock: ${instanceLock.path}`);
if (useReal) describeCameraPlan(cameraPlan);
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
  const idToClose = currentSessionId ?? (currentSessionStart ? await currentSessionStart : null);
  if (idToClose) {
    currentSessionId = idToClose;
    await uploadScheduler.flush();
    await apiClient.endSession(idToClose);
  }
  if (sdkAdapter) await sdkAdapter.destroy();
  await server.close();
  instanceLock?.release();
  process.exit(0);
}

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
