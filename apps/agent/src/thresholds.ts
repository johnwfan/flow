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
  breathing_high_rpm: number;
  hrv_drop_fraction: number;
  eda_rise_fraction: number;
  sustain_s: number;
}

export interface ClassifierThresholds {
  eval_interval_ms: number;
  hysteresis_s: number;
  confidence_threshold: number;
  /** How long confidence must stay below threshold before flipping the
   * displayed state to "no signal", rather than on the very next 1Hz tick.
   * A brief confidence dip (motion, a CPU hiccup) is common and doesn't
   * mean tracking was actually lost -- the SDK's own per-frame framing
   * feedback keeps working through it. */
  no_signal_debounce_s: number;
}

export interface BreathingGuideThresholds {
  /** exhale/inhale ratio — >1 nudges toward a calmer, longer exhale */
  ie_ratio: number;
  /** number of inhale+exhale cycles per guided sequence */
  cycles: number;
  /** RPM to assume if no measured breathing rate is available yet */
  fallback_rpm: number;
}

export interface Thresholds {
  zone_out: ZoneOutThresholds;
  spiral: SpiralThresholds;
  classifier: ClassifierThresholds;
  breathing_guide: BreathingGuideThresholds;
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
      breathing_high_rpm: 20,
      hrv_drop_fraction: 0.2,
      eda_rise_fraction: 0.3,
      sustain_s: 30,
    },
    classifier: {
      eval_interval_ms: 1000,
      hysteresis_s: 5,
      confidence_threshold: 0.5,
      no_signal_debounce_s: 4,
    },
    breathing_guide: {
      ie_ratio: 1.5,
      cycles: 3,
      fallback_rpm: 12,
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
