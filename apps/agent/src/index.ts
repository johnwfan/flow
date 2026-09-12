import { AgentWsServer } from "./ws-server.js";
import { MockEmitter } from "./mock-emitter.js";
import { SdkAdapter } from "./sdk-adapter.js";
import { Session } from "./session.js";
import { Pipeline } from "./pipeline.js";
import { logBanner, logConfig, logSample, logShutdown } from "./logger.js";
import type { SampleMessage, StateMessage } from "@flow/shared";

// ── CLI args ───────────────────────────────────────────────────────
const args = process.argv.slice(2);

if (args.includes("--help") || args.includes("-h")) {
  console.log("Usage: flow-agent [options]");
  console.log("");
  console.log("Options:");
  console.log("  --mock         Use mock emitter (default)");
  console.log("  --real         Use SmartSpectra SDK with real camera");
  console.log("  --port <n>     WebSocket port (default: 8765)");
  console.log("  --camera <n>   Camera device index (default: 0)");
  console.log("  --help, -h     Show this help");
  process.exit(0);
}

const useReal = args.includes("--real");
const portIdx = args.indexOf("--port");
const port = portIdx >= 0 ? parseInt(args[portIdx + 1]!, 10) : 8765;
const camIdx = args.indexOf("--camera");
const cameraIndex = camIdx >= 0 ? parseInt(args[camIdx + 1]!, 10) : 0;

// ── Pipeline (classifier, baseline, window tracker, probes) ───────
const pipeline = new Pipeline({
  broadcast: (msg) => server.broadcast(msg),
});

// ── Session ────────────────────────────────────────────────────────
const session = new Session({
  onStateChange: (state: StateMessage) => {
    server.broadcast(state);
  },
  onWarmupComplete: () => {
    pipeline.onWarmupComplete();
  },
});

// ── WebSocket server ───────────────────────────────────────────────
const server = new AgentWsServer({
  port,
  onSessionControl: (msg) => {
    session.handleControl(msg);

    if (msg.action === "start") {
      pipeline.startTracking();
      startEmitting();
    } else if (msg.action === "end") {
      stopEmitting();
      pipeline.stop();
    } else if (msg.action === "pause") {
      stopEmitting();
    } else if (msg.action === "resume") {
      startEmitting();
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

async function startEmitting(): Promise<void> {
  if (useReal) {
    if (!sdkAdapter) {
      const apiKey = process.env.SMARTSPECTRA_API_KEY;
      if (!apiKey) {
        console.error("[agent] SMARTSPECTRA_API_KEY not set — falling back to mock");
        startMock();
        return;
      }
      sdkAdapter = new SdkAdapter({
        apiKey,
        cameraIndex,
        onSample: handleSample,
      });
      const ok = await sdkAdapter.init();
      if (!ok) {
        console.warn("[agent] SDK init failed — falling back to mock");
        sdkAdapter = null;
        startMock();
        return;
      }
    }
    sdkAdapter.start();
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
  if (mockEmitter?.isRunning) {
    mockEmitter.stop();
  }
  if (sdkAdapter) {
    sdkAdapter.stop().catch((err) => console.error("[agent] SDK stop error:", err));
  }
}

// ── Startup ────────────────────────────────────────────────────────
logBanner();
logConfig({
  mode: useReal ? "real (SmartSpectra SDK)" : "mock (synthetic 20Hz)",
  port,
  deviceId: session.deviceId,
});

console.log("[agent] ready — waiting for session_control start message");

// ── Shutdown ───────────────────────────────────────────────────────
async function shutdown(): Promise<void> {
  logShutdown();
  stopEmitting();
  pipeline.stop();
  if (sdkAdapter) await sdkAdapter.destroy();
  await server.close();
  process.exit(0);
}

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
