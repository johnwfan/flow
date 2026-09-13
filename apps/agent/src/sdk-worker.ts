import { SdkAdapter } from "./sdk-adapter.js";
import type { SampleMessage } from "@flow/shared";

const SMARTSPECTRA_PROCESSING_FAILED_ERROR_CODE = 8;
const SMARTSPECTRA_WORKER_RESTART_EXIT_CODE = 88;

type ParentMessage =
  | { kind: "init"; apiKey: string; cameraIndex: number }
  | { kind: "setCameraIndex"; cameraIndex: number }
  | { kind: "start" }
  | { kind: "stop" }
  | { kind: "destroy" };

type WorkerMessage =
  | { kind: "initResult"; ok: boolean }
  | { kind: "sample"; sample: SampleMessage }
  | { kind: "validation"; code: number; hint: string }
  | { kind: "error"; code: number; message: string; retryable: boolean }
  | { kind: "stopped" };

let adapter: SdkAdapter | null = null;
let cameraIndex = 0;

function send(message: WorkerMessage): void {
  process.send?.(message);
}

async function handleMessage(message: ParentMessage): Promise<void> {
  switch (message.kind) {
    case "init": {
      cameraIndex = message.cameraIndex;
      adapter = new SdkAdapter({
        apiKey: message.apiKey,
        cameraIndex,
        onSample: (sample) => send({ kind: "sample", sample }),
        onValidation: (code, hint) => send({ kind: "validation", code, hint }),
        onError: (code, sdkMessage, retryable) => {
          send({ kind: "error", code, message: sdkMessage, retryable });
          if (code === SMARTSPECTRA_PROCESSING_FAILED_ERROR_CODE) {
            process.exit(SMARTSPECTRA_WORKER_RESTART_EXIT_CODE);
          }
        },
      });
      const ok = await adapter.init();
      send({ kind: "initResult", ok });
      if (!ok) process.exit(1);
      break;
    }
    case "setCameraIndex":
      cameraIndex = message.cameraIndex;
      adapter?.setCameraIndex(cameraIndex);
      break;
    case "start":
      adapter?.start();
      break;
    case "stop":
      await adapter?.stop();
      send({ kind: "stopped" });
      break;
    case "destroy":
      await adapter?.destroy();
      process.exit(0);
      break;
  }
}

process.on("message", (raw) => {
  void handleMessage(raw as ParentMessage).catch((err: any) => {
    send({ kind: "error", code: -2, message: err?.message ?? String(err), retryable: true });
  });
});
