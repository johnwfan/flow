import { readFileSync, watch, existsSync } from "node:fs";
import { join } from "node:path";

export interface ZoneOutThresholds {
  blink_rate_multiplier: number;
  head_stillness_variance_max: number;
  head_stillness_window_s: number;
  hrv_drop_fraction: number;
  eda_drop_fraction: number;
  sustain_s: number;
  require_study_context: boolean;
  require_not_talking: boolean;
}

export interface SpiralThresholds {
  hr_elevation_bpm: number;
  hrv_drop_fraction: number;
  eda_rise_fraction: number;
  sustain_s: number;
}

export interface ClassifierThresholds {
  eval_interval_ms: number;
  hysteresis_s: number;
  confidence_threshold: number;
}

export interface Thresholds {
  zone_out: ZoneOutThresholds;
  spiral: SpiralThresholds;
  classifier: ClassifierThresholds;
}

// Resolve thresholds.json: check agent package root (../thresholds.json from src/ or dist/)
const THRESHOLDS_PATH = (() => {
  const scriptDir = new URL(".", import.meta.url).pathname.replace(/^\/([A-Z]:)/, "$1");
  // From src/ or dist/, go up one level to the agent package root
  const pkgRoot = join(scriptDir, "..", "thresholds.json");
  if (existsSync(pkgRoot)) return pkgRoot;
  // Fallback: cwd
  const cwdPath = join(process.cwd(), "thresholds.json");
  if (existsSync(cwdPath)) return cwdPath;
  // Last resort: next to the script
  return join(scriptDir, "thresholds.json");
})();

let current: Thresholds | null = null;

function loadThresholds(): Thresholds {
  try {
    const raw = readFileSync(THRESHOLDS_PATH, "utf-8");
    current = JSON.parse(raw) as Thresholds;
    return current;
  } catch (err: any) {
    console.warn(`[thresholds] failed to load: ${err.message}, using defaults`);
    return getDefaults();
  }
}

function getDefaults(): Thresholds {
  return {
    zone_out: {
      blink_rate_multiplier: 1.4,
      head_stillness_variance_max: 0.002,
      head_stillness_window_s: 5,
      hrv_drop_fraction: 0.15,
      eda_drop_fraction: 0.1,
      sustain_s: 90,
      require_study_context: true,
      require_not_talking: true,
    },
    spiral: {
      hr_elevation_bpm: 10,
      hrv_drop_fraction: 0.2,
      eda_rise_fraction: 0.3,
      sustain_s: 30,
    },
    classifier: {
      eval_interval_ms: 1000,
      hysteresis_s: 5,
      confidence_threshold: 0.5,
    },
  };
}

export function getThresholds(): Thresholds {
  if (!current) return loadThresholds();
  return current;
}

/** Watch thresholds.json for changes and hot-reload */
export function watchThresholds(): void {
  loadThresholds();
  try {
    watch(THRESHOLDS_PATH, (eventType) => {
      if (eventType === "change") {
        console.log("[thresholds] reloading thresholds.json");
        loadThresholds();
      }
    });
    console.log("[thresholds] watching for changes");
  } catch {
    console.warn("[thresholds] fs.watch not available — hot-reload disabled");
  }
}
