import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import dotenv from "dotenv";
import WebSocket from "ws";
import { listWindowsCameras } from "../src/camera-plan.js";

const scriptDir = dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: join(scriptDir, "..", ".env") });

const args = process.argv.slice(2);
const urlArg = args.indexOf("--url");
const wsUrl = urlArg >= 0 ? args[urlArg + 1]! : "ws://localhost:8765";
const timeoutArg = args.indexOf("--timeout-ms");
const timeoutMs = timeoutArg >= 0 ? Number.parseInt(args[timeoutArg + 1]!, 10) : 35_000;
const preferredName = process.env.FLOW_SENSING_CAMERA_NAME?.trim() || "HD Webcam";

function sampleLooksReal(sample: any): boolean {
  return (
    sample?.pulse_bpm != null ||
    sample?.breathing_rpm != null ||
    sample?.hrv_ms != null ||
    sample?.eda_us != null ||
    sample?.conf != null ||
    sample?.landmarks != null
  );
}

function assertEnv(): void {
  if (!process.env.SMARTSPECTRA_API_KEY) {
    throw new Error("SMARTSPECTRA_API_KEY is missing in apps/agent/.env");
  }
}

function assertCameraPresent(): void {
  if (process.platform !== "win32") return;

  const cameras = listWindowsCameras();
  const okCameras = cameras.filter((camera) => camera.status === "OK");
  if (okCameras.length === 0) {
    throw new Error("Windows does not report any OK camera devices");
  }

  const preferred = okCameras.find((camera) =>
    camera.friendlyName.toLowerCase().includes(preferredName.toLowerCase())
  );
  if (!preferred) {
    const seen = cameras.map((camera) => `${camera.friendlyName} (${camera.status})`).join("; ");
    throw new Error(`preferred sensing camera "${preferredName}" is not OK in Windows. Seen: ${seen}`);
  }

  console.log(`[preflight] preferred camera present: ${preferred.friendlyName}`);
}

function connectOnce(url: string): Promise<WebSocket> {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(url);
    const timer = setTimeout(() => {
      ws.close();
      reject(new Error("timeout"));
    }, 1500);

    ws.once("open", () => {
      clearTimeout(timer);
      resolve(ws);
    });
    ws.once("error", (err) => {
      clearTimeout(timer);
      reject(err);
    });
  });
}

async function waitForWs(url: string, deadline: number): Promise<WebSocket> {
  while (Date.now() < deadline) {
    try {
      return await connectOnce(url);
    } catch {
      await delay(300);
    }
  }
  throw new Error(`agent WebSocket did not open at ${url}`);
}

function waitForSamples(ws: WebSocket, deadline: number): Promise<void> {
  return new Promise((resolve, reject) => {
    let samples = 0;
    let usefulSamples = 0;
    let latestHint: string | null = null;

    const timer = setTimeout(() => {
      const hint = latestHint ? ` Latest camera hint: ${latestHint}` : "";
      reject(new Error(`timed out waiting for real camera samples.${hint}`));
    }, Math.max(1000, deadline - Date.now()));

    ws.on("message", (raw) => {
      let msg: any;
      try {
        msg = JSON.parse(raw.toString());
      } catch {
        return;
      }

      if (msg.kind === "debug_error" && msg.fatal) {
        clearTimeout(timer);
        reject(new Error(msg.reason ?? "camera unavailable"));
        return;
      }

      if (msg.kind === "debug_validation" && msg.hint) {
        latestHint = msg.hint;
        return;
      }

      if (msg.kind !== "sample") return;
      samples++;
      if (sampleLooksReal(msg)) usefulSamples++;
      if (samples >= 5 && usefulSamples >= 1) {
        clearTimeout(timer);
        console.log(`[preflight] samples flowing (${samples} samples, ${usefulSamples} decoded)`);
        resolve();
      }
    });
  });
}

async function main(): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  assertEnv();
  assertCameraPresent();

  console.log(`[preflight] waiting for agent WebSocket at ${wsUrl}`);
  const ws = await waitForWs(wsUrl, deadline);
  const sessionId = `preflight-${Date.now()}`;

  try {
    ws.send(JSON.stringify({ kind: "session_control", action: "start", session_id: sessionId, ts: Date.now() }));
    await waitForSamples(ws, deadline);
    console.log("[preflight] live camera path ready");
  } finally {
    if (ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify({ kind: "session_control", action: "end", session_id: sessionId, ts: Date.now() }));
      await delay(150);
      ws.close();
    }
  }
}

main().catch((err: any) => {
  console.error(`[preflight] failed: ${err.message}`);
  process.exitCode = 1;
});
