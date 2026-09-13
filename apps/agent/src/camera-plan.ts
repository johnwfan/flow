import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";

export interface WindowsCamera {
  status: string;
  friendlyName: string;
  instanceId: string;
}

interface CameraPreferenceCache {
  preferredName: string;
  lastGoodIndex: number;
  updatedAt: string;
  windowsCameras: WindowsCamera[];
}

export interface CameraPlan {
  preferredName: string;
  preferredCamera: WindowsCamera | null;
  windowsCameras: WindowsCamera[];
  candidates: number[];
  cachePath: string;
}

function parseOptionalInt(value: string | undefined): number | null {
  if (!value) return null;
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : null;
}

function normalize(value: string): string {
  return value.trim().toLowerCase();
}

function includesName(deviceName: string, preferredName: string): boolean {
  return normalize(deviceName).includes(normalize(preferredName));
}

function unique(values: (number | null | undefined)[]): number[] {
  const seen = new Set<number>();
  const result: number[] = [];
  for (const value of values) {
    if (value == null || !Number.isFinite(value) || value < 0 || seen.has(value)) continue;
    seen.add(value);
    result.push(value);
  }
  return result;
}

export function listWindowsCameras(): WindowsCamera[] {
  if (process.platform !== "win32") return [];

  try {
    const output = execFileSync(
      "powershell.exe",
      [
        "-NoProfile",
        "-Command",
        "$ErrorActionPreference='Stop'; Get-PnpDevice -Class Camera | Select-Object Status,FriendlyName,InstanceId | ConvertTo-Json -Compress",
      ],
      { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }
    ).trim();
    if (!output) return [];

    const parsed = JSON.parse(output) as unknown;
    const rows = Array.isArray(parsed) ? parsed : [parsed];
    return rows.flatMap((row: any) => {
      if (!row?.FriendlyName) return [];
      return {
        status: String(row.Status ?? "Unknown"),
        friendlyName: String(row.FriendlyName),
        instanceId: String(row.InstanceId ?? ""),
      };
    });
  } catch {
    return [];
  }
}

function readCache(cachePath: string): CameraPreferenceCache | null {
  try {
    if (!existsSync(cachePath)) return null;
    const parsed = JSON.parse(readFileSync(cachePath, "utf8")) as Partial<CameraPreferenceCache>;
    if (typeof parsed.preferredName !== "string" || typeof parsed.lastGoodIndex !== "number") {
      return null;
    }
    return parsed as CameraPreferenceCache;
  } catch {
    return null;
  }
}

export function buildCameraPlan(opts: {
  cachePath: string;
  requestedIndex: number | null;
  preferredName?: string;
}): CameraPlan {
  const preferredName = opts.preferredName?.trim() || process.env.FLOW_SENSING_CAMERA_NAME?.trim() || "HD Webcam";
  const configuredIndex = parseOptionalInt(process.env.FLOW_SENSING_CAMERA_INDEX);
  const windowsCameras = listWindowsCameras();
  const preferredCamera =
    windowsCameras.find((camera) => camera.status === "OK" && includesName(camera.friendlyName, preferredName)) ??
    null;
  const cache = readCache(opts.cachePath);
  const cachedIndex =
    cache && includesName(cache.preferredName, preferredName) ? cache.lastGoodIndex : null;

  // SmartSpectra only accepts numeric device indices, and its order is not
  // exposed in the Node SDK. Once the preferred external camera exists, try
  // the last-good index first, then external-ish slots before the built-in
  // default at 0. The watchdog still proves the choice with real frames.
  const defaultOrder = preferredCamera ? [1, 2, 3, 4, 5, 0] : [0, 1, 2, 3, 4, 5];
  const candidates = unique([
    opts.requestedIndex,
    configuredIndex,
    cachedIndex,
    ...defaultOrder,
  ]);

  return {
    preferredName,
    preferredCamera,
    windowsCameras,
    candidates: candidates.length > 0 ? candidates : [0],
    cachePath: opts.cachePath,
  };
}

export function rememberCameraChoice(plan: CameraPlan, index: number): void {
  try {
    mkdirSync(dirname(plan.cachePath), { recursive: true });
    const cache: CameraPreferenceCache = {
      preferredName: plan.preferredName,
      lastGoodIndex: index,
      updatedAt: new Date().toISOString(),
      windowsCameras: plan.windowsCameras,
    };
    writeFileSync(plan.cachePath, JSON.stringify(cache, null, 2));
  } catch (err: any) {
    console.warn(`[camera] could not remember last-good index: ${err.message}`);
  }
}

export function describeCameraPlan(plan: CameraPlan): void {
  if (plan.windowsCameras.length === 0) {
    console.warn("[camera] Windows camera inventory unavailable or empty");
  } else {
    const summary = plan.windowsCameras
      .map((camera) => `${camera.friendlyName} (${camera.status})`)
      .join("; ");
    console.log(`[camera] Windows sees: ${summary}`);
  }

  if (plan.preferredCamera) {
    console.log(`[camera] preferred sensing camera present: ${plan.preferredCamera.friendlyName}`);
  } else {
    console.warn(`[camera] preferred sensing camera not confirmed by Windows: ${plan.preferredName}`);
  }
  console.log(`[camera] SmartSpectra candidate order: ${plan.candidates.join(", ")}`);
}
