"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { WsMessage, AlertMessage, BreathingGuideMessage, ThoughtProbeMessage } from "@flow/shared";
import { DetectionStatus, State } from "@flow/shared";
import styles from "./session.module.css";

const WS_URL = process.env.NEXT_PUBLIC_AGENT_WS_URL ?? "ws://localhost:8765";

// State -> design-token color group name (see globals.css's state-colour block).
// no_signal deliberately has no entry -- missing data is hatched, never
// colored, per the design handoff's hard rule. "break" is included so the
// dev-only state-preview control (which can show a mood the live classifier
// never actually emits, since `State` has no "break" member) still resolves
// to a real token group.
const STATE_COLOR: Record<string, string> = {
  focused: "deep",
  zoned_out: "zoned",
  spiraling: "spiral",
  warmup: "deep", // "Learning your baseline" uses the deep dot per the handoff's Calibrating edge state
  break: "break",
};

// Mirrors globals.css's state-colour tokens. Duplicated here (rather than
// resolved from the CSS custom property at runtime) because canvas stroke
// colors need a real color string, and the tokens are oklch() values scoped
// to :root, which needs a mounted probe element to resolve reliably -- a
// small duplicate map kept in sync with the CSS file is simpler and matches
// the pattern the rest of this file already uses for STATE_COLOR.
const STATE_STROKE: Record<string, string> = {
  deep: "oklch(0.5 0.24 258)",
  zoned: "oklch(0.66 0.038 248)",
  spiral: "oklch(0.63 0.215 32)",
  break: "oklch(0.8 0.105 82)",
};
const MUTE_STROKE = "oklch(0.54 0 0)";

// ── Reading freshness → color, the way a bedside monitor grays out a
// trace instead of blanking it the instant a lead hiccups. Below FRESH_MS
// a reading shows in its full state color; above STALE_MS it's fully
// muted; in between it's a real perceptual blend (oklch interpolates
// cleanly since it's just three numbers), not a CSS-opacity fake-out.
const FRESH_MS = 2000;
const STALE_MS = 12_000;

// SmartSpectra's ValidationCode.kChestNotVisible -- the single biggest
// reason breathing tracking silently produces nothing: it's estimated
// from chest movement, not the face, so a close/face-only framing (the
// natural way to sit at a laptop) blocks it even though pulse/HRV/blink
// keep working fine off the face alone.
const CHEST_NOT_VISIBLE_CODE = 7;

// Exponential-smoothing factors per metric (higher = tracks raw value
// faster / smooths less) and how often the smoothed value is allowed to
// actually reach React state -- see smoothedRef/uiUpdateAtRef below.
const PULSE_ALPHA = 0.18;
// Was 0.1 -- deliberately smoothed harder than pulse on the assumption
// breathing changes slowly, but breathing_rpm itself only updates every
// few seconds (not every sample), so that extra smoothing stacked with
// its already-slow update rate made the display lag well behind an
// actual breathing-rate change. Now tracks a real change faster than it
// filters noise, since agent-side plausibility filtering (sdk-adapter.ts)
// handles rejecting outright garbage readings instead.
const BREATH_ALPHA = 0.35;
const HRV_ALPHA = 0.12;
const EDA_ALPHA = 0.15;
const CONF_ALPHA = 0.25;
const UI_UPDATE_MS = 450;
const VERY_LOW_SIGNAL_THRESHOLD = 0.05;
const HIGH_BREATHING_MIN_CONFIDENCE = 0.55;

function ema(prev: number | null, next: number, alpha: number): number {
  return prev == null ? next : prev + alpha * (next - prev);
}

function parseOklch(s: string): [number, number, number] | null {
  const m = s.match(/oklch\(\s*([\d.]+)\s+([\d.]+)\s+([\d.]+)/);
  if (!m) return null;
  return [parseFloat(m[1]), parseFloat(m[2]), parseFloat(m[3])];
}

function lerpOklch(a: string, b: string, t: number): string {
  const pa = parseOklch(a);
  const pb = parseOklch(b);
  if (!pa || !pb) return t < 0.5 ? a : b;
  const l = pa[0] + (pb[0] - pa[0]) * t;
  const c = pa[1] + (pb[1] - pa[1]) * t;
  let dh = pb[2] - pa[2];
  if (dh > 180) dh -= 360;
  if (dh < -180) dh += 360;
  const h = (pa[2] + dh * t + 360) % 360;
  return `oklch(${l.toFixed(3)} ${c.toFixed(3)} ${h.toFixed(1)})`;
}

/** A literal oklch stroke/text color, faded toward mute as a reading ages. */
function agedColor(base: string, ageMs: number | null): string {
  if (ageMs == null) return MUTE_STROKE;
  if (ageMs <= FRESH_MS) return base;
  if (ageMs >= STALE_MS) return MUTE_STROKE;
  return lerpOklch(base, MUTE_STROKE, (ageMs - FRESH_MS) / (STALE_MS - FRESH_MS));
}

/** oklch(...) -> oklch(... / alpha), for canvas gradient fills. */
function withAlpha(oklch: string, alpha: number): string {
  const m = oklch.match(/^oklch\(([^)/]+)\)$/);
  return m ? `oklch(${m[1]} / ${alpha})` : oklch;
}

function colorVar(state: string | null, step: "" | "-ink" | "-mid" | "-pale" = ""): string {
  const key = state ? STATE_COLOR[state] : undefined;
  if (!key) return "var(--mute)";
  return `var(--${key}${step})`;
}

function strokeFor(state: string | null): string {
  const key = state ? STATE_COLOR[state] : undefined;
  return key ? (STATE_STROKE[key] ?? MUTE_STROKE) : MUTE_STROKE;
}

function readableState(state: string): string {
  return state.replace(/_/g, " ");
}

function narrativeFor(state: string): string {
  switch (state) {
    case "focused":
      return "You're in it";
    case "zoned_out":
      return "Drifting a little";
    case "spiraling":
      return "Winding up";
    case "break":
      return "Away from the screen";
    case "no_signal":
      // Driven by pulse-reading confidence dropping, not by losing the
      // face itself -- framing feedback and the camera keep working
      // through this, so don't word it like a connection/tracking loss.
      return "Signal's weak right now";
    default:
      return readableState(state);
  }
}

// ── Dev/demo state preview ────────────────────────────────────────────────
// A "Preview state" segmented control lets a developer or demoer see every
// mood the design system defines without a live agent connection. It is
// explicitly a demo affordance (see its label + caption in the header) and
// never touches the safety-relevant real-time path: alerts, the breathing
// guide driven by a real BreathingGuideMessage, the thought probe, app
// context, camera-refused/validation-hint edge states and the connection
// indicator all always reflect real WS data, never the preview selection.
// Only the state badge/headline/reasons and the physiology readouts +
// plots are swapped to placeholder numbers while previewing -- the same
// realistic placeholder values the reference prototype and its README use
// (resting HR 55-85 bpm, HRV 46-112 ms, breathing 12-21/min).
type PreviewKey = "focused" | "zoned" | "spiral" | "break" | "warmup" | "lost";

const PREVIEW_OPTIONS: { key: PreviewKey; label: string }[] = [
  { key: "focused", label: "focused" },
  { key: "zoned", label: "zoned" },
  { key: "spiral", label: "spiral" },
  { key: "break", label: "break" },
  { key: "warmup", label: "warmup" },
  { key: "lost", label: "lost" },
];

const PREVIEW_TARGETS: Record<
  PreviewKey,
  { machine: string; hr: number | null; hrv: number | null; br: number | null; blink: number | null; conf: number; reasons: string[] }
> = {
  focused: {
    machine: "focused",
    hr: 61,
    hrv: 78,
    br: 12.8,
    blink: 15,
    conf: 0.91,
    reasons: ["HR steady 61", "I:E 1 : 1.9", "blink 15 /min", "gaze on-task 94%", "no app switches 11m"],
  },
  zoned: {
    machine: "zoned_out",
    hr: 55,
    hrv: 92,
    br: 11.8,
    blink: 4,
    conf: 0.86,
    reasons: ["HR fell 6 bpm", "blink 4 /min", "gaze fixed 88%", "no scroll 2m10s"],
  },
  spiral: {
    machine: "spiraling",
    hr: 81,
    hrv: 48,
    br: 21.2,
    blink: 21,
    conf: 0.83,
    reasons: ["HR up 81", "breathing 21 /min", "blink 21 /min", "gaze off-task 39%", "4 switches 3m"],
  },
  break: { machine: "break", hr: 67, hrv: 84, br: 14.2, blink: 17, conf: 0.74, reasons: [] },
  warmup: { machine: "warmup", hr: 64, hrv: 74, br: 13.4, blink: 16, conf: 0.52, reasons: [] },
  lost: { machine: "no_signal", hr: null, hrv: null, br: null, blink: null, conf: 0.28, reasons: [] },
};

const ALERT_COPY: Record<"zone_out" | "spiral", { meta: string; title: string; primary: string; secondary: string }> = {
  zone_out: { meta: "soft chime", title: "Still with it?", primary: "2-min reset", secondary: "Take a break" },
  spiral: {
    meta: "voice-guided",
    title: "Your breathing is running ahead of you.",
    primary: "Start the loop",
    secondary: "Take a break",
  },
};

const DEMO_ALERT: Record<"zone_out" | "spiral", AlertMessage> = {
  zone_out: { kind: "alert", type: "zone_out", reasons: ["pulse_down_six", "blinks_down_to_four", "gaze_parked"], ts: 0, duration_s: 90 },
  spiral: { kind: "alert", type: "spiral", reasons: ["breathing_above_twenty", "climbing_four_minutes"], ts: 0, duration_s: 240 },
};

const HIGH_BREATHING_RPM = 20;
const HIGH_BREATHING_CLEAR_RPM = 18;
const HIGH_BREATHING_ALERT_COOLDOWN_MS = 45_000;
const BREATHING_EXERCISE_MS = 2 * 60 * 1000;

const BREATHING_RHYTHMS = {
  reset: {
    title: "Two-minute reset",
    lead: "Follow the circle until your attention has somewhere simple to land.",
    inhaleMs: 4000,
    exhaleMs: 4000,
  },
  calm: {
    title: "Slow the breathing loop",
    lead: "Longer exhales nudge the system down without asking you to think about it.",
    inhaleMs: 4000,
    exhaleMs: 6000,
  },
} as const;

type BreathingExerciseMode = keyof typeof BREATHING_RHYTHMS;
type BreathingExerciseSource = "alert" | "high_breathing";

interface BreathingExerciseRequest {
  mode: BreathingExerciseMode;
  source: BreathingExerciseSource;
  measuredRpm: number | null;
  startedAt: number;
}

interface RollingSeries {
  values: (number | null)[];
}

const SERIES_LENGTH = 300; // ~15s at 20Hz
const SPARK_TAIL = 40; // matches the reference prototype's 40-sample sparkline window

// This page runs 7 independent canvases (2 big Waveforms + 5 rail
// Sparklines), each previously redrawing on every requestAnimationFrame
// tick (up to 60fps) forever, even though the underlying values only
// change a few times a second. On the same machine that's also running
// SmartSpectra's native video pipeline, that's real, sustained main-thread
// CPU competing with it -- confirmed live: physiological signal quality
// (breathing especially) visibly improved the moment the tab lost focus
// and Chrome throttled these rAF loops on its own. Capping the redraw
// rate ourselves gets that CPU back while the tab stays in the
// foreground, where the page is actually supposed to be used.
const DRAW_INTERVAL_MS = 80; // ~12fps -- smooth enough for slowly-varying vitals
const INTEGRATED_CAMERA_PATTERNS = [/integrated/i, /built.?in/i, /internal/i, /hp wide vision/i, /hp true vision/i];
const SENSING_CAMERA_PATTERNS = [/hd webcam/i, /brio/i, /logitech/i, /usb/i, /elgato/i];

type PreviewStatus = "idle" | "starting" | "live" | "blocked";

function matchesAny(value: string, patterns: RegExp[]): boolean {
  return patterns.some((pattern) => pattern.test(value));
}

function isLikelyIntegratedCamera(device: MediaDeviceInfo | { label: string } | null | undefined): boolean {
  return !!device?.label && matchesAny(device.label, INTEGRATED_CAMERA_PATTERNS);
}

function isLikelySensingCamera(device: MediaDeviceInfo | { label: string } | null | undefined): boolean {
  return !!device?.label && matchesAny(device.label, SENSING_CAMERA_PATTERNS);
}

function choosePreviewDevice(devices: MediaDeviceInfo[], protectSensingCamera: boolean): MediaDeviceInfo | null {
  const videoInputs = devices.filter((device) => device.kind === "videoinput");
  if (videoInputs.length === 0) return null;

  const integrated = videoInputs.find(isLikelyIntegratedCamera);
  if (integrated) return integrated;

  if (protectSensingCamera) {
    const nonSensing = videoInputs.find((device) => device.label && !isLikelySensingCamera(device));
    if (nonSensing) return nonSensing;
    return null;
  }

  return videoInputs[0] ?? null;
}

function useRollingSeries(length: number = SERIES_LENGTH): [RollingSeries, (v: number | null) => void] {
  const ref = useRef<RollingSeries>({ values: [] });
  const push = useCallback(
    (v: number | null) => {
      ref.current.values.push(v);
      if (ref.current.values.length > length) ref.current.values.shift();
    },
    [length],
  );
  return [ref.current, push];
}

function usePrefersReducedMotion(): boolean {
  const [reduced, setReduced] = useState(false);
  useEffect(() => {
    if (typeof window === "undefined" || !window.matchMedia) return;
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    setReduced(mq.matches);
    const handler = (e: MediaQueryListEvent) => setReduced(e.matches);
    mq.addEventListener("change", handler);
    return () => mq.removeEventListener("change", handler);
  }, []);
  return reduced;
}

// Turns a polyline into a visually smooth curve by running the path
// through the midpoint of each pair of points (a standard trick for
// smoothing without an external charting library). Combined with the
// EMA-smoothed values already being pushed into the series (see the
// sample handler), this is what makes the plot read as a calm monitor
// trace instead of raw per-frame sensor noise.
function tracePath(ctx: CanvasRenderingContext2D, pts: { x: number; y: number }[]) {
  if (pts.length < 3) {
    for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i].x, pts[i].y);
    return;
  }
  for (let i = 1; i < pts.length - 1; i++) {
    const midX = (pts[i].x + pts[i + 1].x) / 2;
    const midY = (pts[i].y + pts[i + 1].y) / 2;
    ctx.quadraticCurveTo(pts[i].x, pts[i].y, midX, midY);
  }
  const last = pts[pts.length - 1];
  ctx.lineTo(last.x, last.y);
}

function Waveform({
  series,
  color,
  height,
  lost,
  ariaLabel,
}: {
  series: RollingSeries;
  color: string;
  height: number;
  lost: boolean;
  ariaLabel: string;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  // Eased vertical range -- a single outlier sample shouldn't make the
  // whole plot visibly jump. Persists across frames via ref.
  const scaleRef = useRef<{ lo: number; hi: number } | null>(null);
  const lastDrawRef = useRef(0);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    let raf: number;
    const draw = (t: number) => {
      if (t - lastDrawRef.current < DRAW_INTERVAL_MS) {
        raf = requestAnimationFrame(draw);
        return;
      }
      lastDrawRef.current = t;
      const rect = canvas.getBoundingClientRect();
      const dpr = window.devicePixelRatio || 1;
      if (canvas.width !== rect.width * dpr) canvas.width = rect.width * dpr;
      if (canvas.height !== rect.height * dpr) canvas.height = rect.height * dpr;
      const ctx = canvas.getContext("2d")!;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      const w = rect.width;
      const h = rect.height;
      ctx.clearRect(0, 0, w, h);

      // gridlines (matches --line-soft, now monochrome)
      ctx.strokeStyle = "oklch(0.935 0 0)";
      ctx.lineWidth = 1;
      for (let i = 1; i < 3; i++) {
        const y = (h / 3) * i;
        ctx.beginPath();
        ctx.moveTo(0, y + 0.5);
        ctx.lineTo(w, y + 0.5);
        ctx.stroke();
      }

      const known = series.values.filter((v): v is number => v != null);
      if (known.length < 2) {
        raf = requestAnimationFrame(draw);
        return;
      }
      const targetMin = Math.min(...known);
      const targetMax = Math.max(...known);
      const targetPad = (targetMax - targetMin) * 0.25 || 1;
      const targetLo = targetMin - targetPad;
      const targetHi = targetMax + targetPad;
      if (!scaleRef.current) scaleRef.current = { lo: targetLo, hi: targetHi };
      const sc = scaleRef.current;
      sc.lo += (targetLo - sc.lo) * 0.06;
      sc.hi += (targetHi - sc.hi) * 0.06;
      const lo = sc.lo;
      const hi = sc.hi;

      const stepX = w / (SERIES_LENGTH - 1);
      const offset = SERIES_LENGTH - series.values.length;

      // Break the series into contiguous runs (nulls end a run) so gaps
      // stay honest gaps rather than a line drawn straight through them.
      const segments: { x: number; y: number }[][] = [];
      let current: { x: number; y: number }[] = [];
      series.values.forEach((v, i) => {
        if (v == null) {
          if (current.length) segments.push(current);
          current = [];
          return;
        }
        current.push({ x: (offset + i) * stepX, y: h - ((v - lo) / (hi - lo)) * h });
      });
      if (current.length) segments.push(current);

      segments.forEach((pts) => {
        if (pts.length < 2) return;

        // Soft gradient fill under the curve, like a bedside monitor trace.
        const grad = ctx.createLinearGradient(0, 0, 0, h);
        grad.addColorStop(0, withAlpha(color, 0.22));
        grad.addColorStop(1, withAlpha(color, 0));
        ctx.beginPath();
        ctx.moveTo(pts[0].x, h);
        ctx.lineTo(pts[0].x, pts[0].y);
        tracePath(ctx, pts);
        ctx.lineTo(pts[pts.length - 1].x, h);
        ctx.closePath();
        ctx.fillStyle = grad;
        ctx.fill();

        ctx.beginPath();
        ctx.moveTo(pts[0].x, pts[0].y);
        tracePath(ctx, pts);
        ctx.strokeStyle = color;
        ctx.lineWidth = 2;
        ctx.lineJoin = "round";
        ctx.lineCap = "round";
        ctx.stroke();
      });

      raf = requestAnimationFrame(draw);
    };
    raf = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(raf);
  }, [series, color]);

  return (
    <div className={styles.plotFrame} style={{ height }}>
      <canvas ref={canvasRef} className={styles.plotCanvas} role="img" aria-label={ariaLabel} />
      {lost && (
        <div className={styles.signalLost}>
          <span className={styles.signalLostLabel}>signal lost &middot; not interpolated</span>
        </div>
      )}
    </div>
  );
}

// Small trend sparkline for the rail -- same rolling-series data as the big
// waveforms, just the most recent tail and no gridlines/hatching (a lost
// signal there just blanks to "--" via the surrounding number, per the
// handoff's "missing data is hatched, never coloured" rule -- there is
// nothing to hatch in a 18px strip).
function Sparkline({ series, color, height, ariaLabel }: { series: RollingSeries; color: string; height: number; ariaLabel: string }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const lastDrawRef = useRef(0);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    let raf: number;
    const draw = (t: number) => {
      if (t - lastDrawRef.current < DRAW_INTERVAL_MS) {
        raf = requestAnimationFrame(draw);
        return;
      }
      lastDrawRef.current = t;
      const rect = canvas.getBoundingClientRect();
      const dpr = window.devicePixelRatio || 1;
      if (canvas.width !== rect.width * dpr) canvas.width = rect.width * dpr;
      if (canvas.height !== rect.height * dpr) canvas.height = rect.height * dpr;
      const ctx = canvas.getContext("2d")!;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      const w = rect.width;
      const h = rect.height;
      ctx.clearRect(0, 0, w, h);

      const tail = series.values.slice(-SPARK_TAIL);
      const known = tail.filter((v): v is number => v != null);
      if (known.length < 2) {
        raf = requestAnimationFrame(draw);
        return;
      }
      const min = Math.min(...known);
      const max = Math.max(...known);
      const pad = (max - min) * 0.15 || 1;
      const lo = min - pad;
      const hi = max + pad;
      const stepX = tail.length > 1 ? w / (tail.length - 1) : w;

      const pts: { x: number; y: number }[] = [];
      tail.forEach((v, i) => {
        if (v == null) return;
        pts.push({ x: i * stepX, y: h - 2 - ((v - lo) / (hi - lo)) * (h - 4) });
      });
      let lastX = 0;
      let lastY = 0;
      if (pts.length >= 2) {
        ctx.beginPath();
        ctx.moveTo(pts[0].x, pts[0].y);
        tracePath(ctx, pts);
        ctx.strokeStyle = color;
        ctx.lineWidth = 1.4;
        ctx.lineJoin = "round";
        ctx.lineCap = "round";
        ctx.stroke();
        lastX = pts[pts.length - 1].x;
        lastY = pts[pts.length - 1].y;
      }
      ctx.beginPath();
      ctx.arc(lastX, lastY, 1.8, 0, Math.PI * 2);
      ctx.fillStyle = color;
      ctx.fill();

      raf = requestAnimationFrame(draw);
    };
    raf = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(raf);
  }, [series, color]);

  return <canvas ref={canvasRef} className={styles.sparkCanvas} style={{ height }} role="img" aria-label={ariaLabel} />;
}

// Two rhythms that must never be mistaken for each other (see the design
// handoff's "Breathing pacer" spec). Driven by the real BreathingGuideMessage
// when the agent sends one (phase + duration_ms come straight from the wire);
// the decorative concentric-ping / rotating-sweep flourishes are ambient CSS
// loops layered on top, not tied to exact server timing. Rhythm is inferred
// from the reported I:E ratio: close to 1:1 reads as the symmetric
// "upregulate" reset, a longer exhale reads as the "extended exhale" spiral
// pacer -- the contract has no explicit "kind" field to read instead.
function BreathingPacer({ guide, size = "compact" }: { guide: BreathingGuideMessage; size?: "compact" | "large" }) {
  const reducedMotion = usePrefersReducedMotion();
  const kind: "upregulate" | "extended-exhale" = guide.ie_ratio > 1.3 ? "extended-exhale" : "upregulate";
  const isInhale = guide.phase !== "exhale";
  const color = kind === "extended-exhale" ? "var(--spiral)" : "var(--zoned)";
  const seconds = Math.max(1, Math.round(guide.duration_ms / 1000));
  const label = `${guide.phase === "exhale" ? "out" : "in"} ${seconds}`;
  const scale = size === "large" ? 2.15 : 1;

  const baseCoreSize = kind === "upregulate" ? (isInhale ? 97 : 36) : isInhale ? 92 : 48;
  const coreSize = Math.round(baseCoreSize * scale);

  return (
    <div className={styles.pacerWrap} data-kind={kind} data-size={size}>
      {!reducedMotion && kind === "upregulate" && (
        <>
          <span className={styles.pacerGhost} aria-hidden="true" />
          <span className={styles.pacerRingA} aria-hidden="true" />
          <span className={styles.pacerRingB} aria-hidden="true" />
        </>
      )}
      {!reducedMotion && kind === "extended-exhale" && <span className={styles.pacerArc} aria-hidden="true" />}
      <span
        className={styles.pacerCore}
        style={{
          width: coreSize,
          height: coreSize,
          background: color,
          transitionDuration: reducedMotion ? "0ms" : `${guide.duration_ms}ms`,
        }}
      />
      <span className={styles.pacerLabel}>{label}</span>
    </div>
  );
}

function formatRemaining(ms: number): string {
  const s = Math.max(0, Math.ceil(ms / 1000));
  const m = Math.floor(s / 60);
  const rem = s % 60;
  return `${m}:${rem.toString().padStart(2, "0")}`;
}

function BreathingExerciseWidget({
  request,
  liveGuide,
  onClose,
}: {
  request: BreathingExerciseRequest;
  liveGuide: BreathingGuideMessage | null;
  onClose: () => void;
}) {
  const rhythm = BREATHING_RHYTHMS[request.mode];
  const [phase, setPhase] = useState<"inhale" | "exhale">("inhale");
  const [remainingMs, setRemainingMs] = useState<number>(BREATHING_EXERCISE_MS);
  const [phaseRemainingMs, setPhaseRemainingMs] = useState<number>(rhythm.inhaleMs);
  const [done, setDone] = useState(false);

  useEffect(() => {
    let phaseTimer: ReturnType<typeof setTimeout> | null = null;
    let tickTimer: ReturnType<typeof setInterval> | null = null;
    let phaseEndsAt = Date.now();
    const endAt = Date.now() + BREATHING_EXERCISE_MS;

    const clearTimers = () => {
      if (phaseTimer) clearTimeout(phaseTimer);
      if (tickTimer) clearInterval(tickTimer);
      phaseTimer = null;
      tickTimer = null;
    };

    const runPhase = (next: "inhale" | "exhale") => {
      const remaining = endAt - Date.now();
      if (remaining <= 0) {
        clearTimers();
        setDone(true);
        setRemainingMs(0);
        setPhaseRemainingMs(0);
        return;
      }
      const duration = next === "inhale" ? rhythm.inhaleMs : rhythm.exhaleMs;
      setPhase(next);
      phaseEndsAt = Date.now() + Math.min(duration, remaining);
      setPhaseRemainingMs(Math.max(0, phaseEndsAt - Date.now()));
      phaseTimer = setTimeout(() => runPhase(next === "inhale" ? "exhale" : "inhale"), Math.min(duration, remaining));
    };

    setDone(false);
    setRemainingMs(BREATHING_EXERCISE_MS);
    runPhase("inhale");
    tickTimer = setInterval(() => {
      const remaining = Math.max(0, endAt - Date.now());
      setRemainingMs(remaining);
      setPhaseRemainingMs(Math.max(0, phaseEndsAt - Date.now()));
      if (remaining <= 0) {
        clearTimers();
        setDone(true);
      }
    }, 250);

    return clearTimers;
  }, [request.startedAt, rhythm.exhaleMs, rhythm.inhaleMs]);

  const currentDuration = phase === "inhale" ? rhythm.inhaleMs : rhythm.exhaleMs;
  const displayGuide: BreathingGuideMessage = {
    kind: "breathing_guide",
    phase,
    duration_ms: currentDuration,
    measured_rpm: liveGuide?.measured_rpm ?? request.measuredRpm ?? 0,
    ie_ratio: rhythm.exhaleMs / rhythm.inhaleMs,
  };
  const phaseLabel = phase === "inhale" ? "Breathe in" : "Breathe out";
  const sourceLabel = request.source === "high_breathing" ? "breathing above 20/min" : "intervention";

  return (
    <div className={styles.breathingBackdrop} role="presentation">
      <section
        className={styles.breathingWidget}
        role="dialog"
        aria-modal="true"
        aria-labelledby="breathing-widget-title"
      >
        <div className={styles.breathingTop}>
          <div>
            <div className={styles.breathingKicker}>{sourceLabel}</div>
            <h2 id="breathing-widget-title" className={styles.breathingTitle}>
              {done ? "Nice work" : rhythm.title}
            </h2>
          </div>
          <button className={`${styles.btn} ${styles.btnQuiet} ${styles.breathingClose}`} onClick={onClose}>
            Close
          </button>
        </div>
        <p className={styles.breathingLead}>{done ? "The loop is complete." : rhythm.lead}</p>
        <div className={styles.breathingCenter}>
          <BreathingPacer guide={displayGuide} size="large" />
          <div className={styles.breathingReadout}>
            <div className={styles.breathingPhase}>{done ? "Complete" : phaseLabel}</div>
            <div className={`${styles.breathingTimer} ${styles.num}`}>{formatRemaining(remainingMs)}</div>
            {!done && (
              <div className={`${styles.breathingSubtimer} ${styles.num}`}>
                {Math.ceil(phaseRemainingMs / 1000)}s on this breath
              </div>
            )}
          </div>
        </div>
        <div className={styles.breathingFooter}>
          <span className={styles.breathingMetric}>
            measured {displayGuide.measured_rpm > 0 ? displayGuide.measured_rpm.toFixed(1) : "--"} /min
          </span>
          <span className={styles.breathingMetric}>I:E 1 : {displayGuide.ie_ratio.toFixed(1)}</span>
        </div>
      </section>
    </div>
  );
}

export default function SessionPage() {
  const wsRef = useRef<WebSocket | null>(null);
  const [connected, setConnected] = useState(false);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const sessionIdRef = useRef(sessionId);
  sessionIdRef.current = sessionId;
  const [phase, setPhase] = useState<"idle" | "warmup" | "active" | "paused" | "ended">("idle");
  const phaseRef = useRef(phase);
  phaseRef.current = phase;
  const [state, setState] = useState<{ state: string; reasons: string[]; confidence: number } | null>(null);
  const [pulse, setPulse] = useState<number | null>(null);
  const [breathing, setBreathing] = useState<number | null>(null);
  const [hrv, setHrv] = useState<number | null>(null);
  const [eda, setEda] = useState<number | null>(null);
  const [conf, setConf] = useState<number | null>(null);
  const [blinkDetected, setBlinkDetected] = useState<DetectionStatus | null>(null);
  const [appContext, setAppContext] = useState<{ app_title: string; category: string } | null>(null);
  const [alert, setAlert] = useState<AlertMessage | null>(null);
  const alertRef = useRef<AlertMessage | null>(null);
  alertRef.current = alert;
  const [guide, setGuide] = useState<BreathingGuideMessage | null>(null);
  const [probe, setProbe] = useState<ThoughtProbeMessage | null>(null);
  const [probeSecondsLeft, setProbeSecondsLeft] = useState(20);
  const stateRef = useRef<typeof state>(null);
  stateRef.current = state;
  const breathingRef = useRef<number | null>(null);
  breathingRef.current = breathing;
  const highBreathingAlertRef = useRef({ armed: true, lastAt: 0 });
  const [breathingExercise, setBreathingExercise] = useState<BreathingExerciseRequest | null>(null);
  const [elapsedS, setElapsedS] = useState(0);
  const startedAtRef = useRef<number | null>(null);
  const [validationHint, setValidationHint] = useState<string | null>(null);
  const [validationCode, setValidationCode] = useState<number | null>(null);
  const [cameraRefused, setCameraRefused] = useState<string | null>(null);
  const [previewOn, setPreviewOn] = useState(false);
  const [previewStatus, setPreviewStatus] = useState<PreviewStatus>("idle");
  const [previewMessage, setPreviewMessage] = useState("preview off");
  const [previewDeviceLabel, setPreviewDeviceLabel] = useState<string | null>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const previewStreamRef = useRef<MediaStream | null>(null);

  const [lastPacketAt, setLastPacketAt] = useState<number | null>(null);
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    // Faster than the old 1000ms so the freshness-based color fade (see
    // agedColor) reads as a smooth fade rather than a visible step.
    const id = setInterval(() => setNow(Date.now()), 400);
    return () => clearInterval(id);
  }, []);

  const [pulseSeries, pushPulse] = useRollingSeries();
  const [breathSeries, pushBreath] = useRollingSeries();
  const [hrvSeries, pushHrv] = useRollingSeries();
  const [blinkSeries, pushBlink] = useRollingSeries();
  const [edaSeries, pushEda] = useRollingSeries();

  // Real per-frame samples arrive noisy and at 20-30Hz -- pushing every
  // one straight into React state made the on-screen numbers flash. A
  // real monitor instead shows a damped reading that holds its last
  // known value between updates. smoothedRef holds the exponentially-
  // smoothed running value per metric (persists across nulls); lastGoodRef
  // timestamps the last real (non-null) sample per metric, driving the
  // color fade; uiUpdateAtRef throttles how often that smoothed value
  // actually reaches React state / the canvas series.
  const smoothedRef = useRef({ pulse: null as number | null, breathing: null as number | null, hrv: null as number | null, eda: null as number | null, conf: null as number | null });
  const lastGoodRef = useRef({ pulse: null as number | null, breathing: null as number | null, hrv: null as number | null, eda: null as number | null });
  const uiUpdateAtRef = useRef(0);

  // Dev/demo state preview -- see the block comment above PreviewKey.
  const [previewState, setPreviewState] = useState<PreviewKey | null>(null);
  const previewStateRef = useRef<PreviewKey | null>(null);
  previewStateRef.current = previewState;
  const [previewAlertOn, setPreviewAlertOn] = useState(false);
  const [demoControlsOpen, setDemoControlsOpen] = useState(false);
  const [demoUiHidden, setDemoUiHidden] = useState(false);
  const demoRef = useRef({ hr: 61, hrv: 78, br: 12.8, blink: 15 });

  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      const target = e.target as HTMLElement | null;
      const isTyping =
        target?.tagName === "INPUT" ||
        target?.tagName === "TEXTAREA" ||
        target?.tagName === "SELECT" ||
        target?.isContentEditable;
      if (isTyping || e.altKey || e.ctrlKey || e.metaKey) return;

      const key = e.key.toLowerCase();
      if (key === "h") {
        e.preventDefault();
        setDemoUiHidden((hidden) => !hidden);
      } else if (key === "c") {
        e.preventDefault();
        const chimeType =
          alertRef.current?.type ??
          (stateRef.current?.state === State.Spiraling || (breathingRef.current ?? 0) > HIGH_BREATHING_RPM ? "spiral" : "zone_out");
        void playChime(chimeType);
      }
    }

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  function maybeNotifyHighBreathing(rpm: number, ts: number) {
    const tracker = highBreathingAlertRef.current;
    if (previewStateRef.current || phaseRef.current === "idle" || phaseRef.current === "ended") return;
    if ((smoothedRef.current.conf ?? 1) < HIGH_BREATHING_MIN_CONFIDENCE) return;

    if (rpm <= HIGH_BREATHING_CLEAR_RPM) {
      tracker.armed = true;
      return;
    }

    if (rpm <= HIGH_BREATHING_RPM || !tracker.armed || ts - tracker.lastAt < HIGH_BREATHING_ALERT_COOLDOWN_MS) return;

    tracker.armed = false;
    tracker.lastAt = ts;
    const msg: AlertMessage = {
      kind: "alert",
      type: "spiral",
      reasons: [`breathing ${rpm.toFixed(1)} per min`, "above 20 per min"],
      ts,
      duration_s: 0,
    };
    setAlert(msg);
    void playChime("spiral");
  }

  useEffect(() => {
    let cancelled = false;
    let retryTimer: ReturnType<typeof setTimeout>;

    function connect() {
      const ws = new WebSocket(WS_URL);
      wsRef.current = ws;
      ws.onopen = () => {
        if (cancelled) return;
        setConnected(true);
        const currentSessionId = sessionIdRef.current;
        const currentPhase = phaseRef.current;
        const shouldResume =
          currentSessionId &&
          (currentPhase === "warmup" || currentPhase === "active" || currentPhase === "paused");
        if (!shouldResume) return;
        ws.send(JSON.stringify({ kind: "session_control", action: "start", session_id: currentSessionId, ts: Date.now() }));
        if (currentPhase === "paused") {
          ws.send(JSON.stringify({ kind: "session_control", action: "pause", session_id: currentSessionId, ts: Date.now() }));
        }
      };
      ws.onclose = () => {
        if (cancelled) return;
        setConnected(false);
        retryTimer = setTimeout(connect, 2000);
      };
      ws.onerror = () => ws.close();
      ws.onmessage = (ev) => {
        const msg = JSON.parse(ev.data) as WsMessage;
        setLastPacketAt(Date.now());
        switch (msg.kind) {
          case "sample": {
            const t = Date.now();
            const sm = smoothedRef.current;
            if (msg.eda_us != null) {
              sm.eda = ema(sm.eda, msg.eda_us, EDA_ALPHA);
              lastGoodRef.current.eda = t;
            }
            pushEda(sm.eda);
            if (!previewStateRef.current) {
              if (msg.pulse_bpm != null) {
                sm.pulse = ema(sm.pulse, msg.pulse_bpm, PULSE_ALPHA);
                lastGoodRef.current.pulse = t;
              }
              if (msg.breathing_rpm != null) {
                sm.breathing = ema(sm.breathing, msg.breathing_rpm, BREATH_ALPHA);
                lastGoodRef.current.breathing = t;
              }
              if (msg.hrv_ms != null) {
                sm.hrv = ema(sm.hrv, msg.hrv_ms, HRV_ALPHA);
                lastGoodRef.current.hrv = t;
              }
              if (msg.conf != null) sm.conf = ema(sm.conf, msg.conf, CONF_ALPHA);
              if (sm.breathing != null) maybeNotifyHighBreathing(sm.breathing, t);
              pushPulse(sm.pulse);
              pushBreath(sm.breathing);
              pushHrv(sm.hrv);
              pushBlink(msg.blink === DetectionStatus.Detected ? 1 : msg.blink === DetectionStatus.NotDetected ? 0 : null);

              // Medical-monitor-style readout: push the smoothed values to
              // React state (and thus the screen) a few times a second,
              // holding the last known good reading between updates and
              // through brief nulls, instead of flashing every raw 20-30Hz
              // sample straight to the numbers.
              if (t - uiUpdateAtRef.current >= UI_UPDATE_MS) {
                uiUpdateAtRef.current = t;
                setEda(sm.eda);
                setPulse(sm.pulse);
                setBreathing(sm.breathing);
                setHrv(sm.hrv);
                setConf(sm.conf);
                setBlinkDetected(msg.blink);
              }
            }
            break;
          }
          case "state":
            if (!previewStateRef.current) {
              setState({ state: msg.state, reasons: msg.reasons, confidence: msg.confidence });
            }
            if (msg.state === State.Warmup) setPhase("warmup");
            else if (phaseRef.current !== "paused") setPhase("active");
            break;
          case "alert":
            setAlert(msg);
            void playChime(msg.type);
            break;
          case "app_context":
            setAppContext({ app_title: msg.app_title, category: msg.category });
            break;
          case "breathing_guide":
            setGuide(msg);
            break;
          case "thought_probe":
            setProbe(msg);
            setProbeSecondsLeft(20);
            break;
          default: {
            // Diagnostic-only messages outside the frozen WsMessage
            // contract (see ws-server.ts's broadcastRaw / index.ts's
            // debug_validation and debug_error).
            const raw = msg as unknown as { kind: string; hint?: string; code?: number; reason?: string; fatal?: boolean };
            if (raw.kind === "debug_validation" && raw.hint) {
              setValidationHint(raw.hint);
              setValidationCode(raw.code ?? null);
            } else if (raw.kind === "debug_error" && raw.fatal) {
              setCameraRefused(raw.reason ?? "camera unavailable");
            }
          }
        }
      };
    }
    connect();
    return () => {
      cancelled = true;
      clearTimeout(retryTimer);
      wsRef.current?.close();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (phase !== "active" && phase !== "warmup") return;
    const id = setInterval(() => {
      if (startedAtRef.current) setElapsedS(Math.round((Date.now() - startedAtRef.current) / 1000));
    }, 1000);
    return () => clearInterval(id);
  }, [phase]);

  // Thought-probe self-dismiss countdown -- "disappears on its own", per the
  // handoff. Declining (letting it expire) is not recorded as anything.
  useEffect(() => {
    if (!probe) return;
    const id = setInterval(() => {
      setProbeSecondsLeft((s) => {
        if (s <= 1) {
          setProbe(null);
          return 20;
        }
        return s - 1;
      });
    }, 1000);
    return () => clearInterval(id);
  }, [probe]);

  function respondToProbe(answer: "focused" | "drifting") {
    const ws = wsRef.current;
    if (probe && ws && ws.readyState === WebSocket.OPEN) {
      ws.send(
        JSON.stringify({
          kind: "thought_probe",
          ts: probe.ts,
          classifier_state: probe.classifier_state,
          user_response: answer,
        }),
      );
    }
    setProbe(null);
  }

  // Demo ticker: while previewing, ease the same numeric readouts the real
  // "sample" handler drives toward the selected state's placeholder targets,
  // with the same bounded-jitter easing the reference prototype uses. Never
  // touches alert/guide/probe/appContext/connection -- those stay real.
  useEffect(() => {
    if (!previewState) return;
    const target = PREVIEW_TARGETS[previewState];
    setState({ state: target.machine, reasons: target.reasons, confidence: target.conf });
    if (target.hr == null) {
      setPulse(null);
      setBreathing(null);
      setHrv(null);
      setConf(target.conf);
      setBlinkDetected(null);
      pushPulse(null);
      pushBreath(null);
      pushHrv(null);
      pushBlink(null);
      return;
    }
    const ease = (v: number, t: number, j: number) => v + (t - v) * 0.16 + (Math.random() - 0.5) * j;
    const id = setInterval(() => {
      const d = demoRef.current;
      d.hr = ease(d.hr, target.hr!, 1.1);
      d.hrv = ease(d.hrv, target.hrv!, 2.2);
      d.br = ease(d.br, target.br!, 0.35);
      d.blink = ease(d.blink, target.blink!, 0.8);
      setPulse(d.hr);
      setBreathing(d.br);
      setHrv(d.hrv);
      setConf(target.conf);
      setBlinkDetected(Math.random() < d.blink / 30 ? DetectionStatus.Detected : DetectionStatus.NotDetected);
      pushPulse(d.hr);
      pushBreath(d.br);
      pushHrv(d.hrv);
      pushBlink(Math.random() < d.blink / 30 ? 1 : 0);
    }, 200);
    return () => clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [previewState]);

  // Demo breathing pacer -- lets a developer see both pacer rhythms without
  // waiting for a real alert + agent-driven guide. Only synthesizes one when
  // previewing the two states that actually trigger a real guide, and only
  // while no real guide is already streaming.
  useEffect(() => {
    if (previewState !== "zoned" && previewState !== "spiral") return;
    const inhaleMs = 4000;
    const exhaleMs = previewState === "spiral" ? 8000 : 4000;
    const ieRatio = previewState === "spiral" ? 2 : 1;
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout>;
    const step = (nextPhase: "inhale" | "exhale") => {
      if (cancelled) return;
      const duration = nextPhase === "inhale" ? inhaleMs : exhaleMs;
      setGuide({ kind: "breathing_guide", phase: nextPhase, duration_ms: duration, measured_rpm: PREVIEW_TARGETS[previewState].br ?? 12, ie_ratio: ieRatio });
      timer = setTimeout(() => step(nextPhase === "inhale" ? "exhale" : "inhale"), duration);
    };
    step("inhale");
    return () => {
      cancelled = true;
      clearTimeout(timer);
      setGuide(null);
    };
  }, [previewState]);

  function send(action: "start" | "end" | "pause" | "resume") {
    const ws = wsRef.current;
    if (!ws || ws.readyState !== WebSocket.OPEN) return;
    if (action === "start" || action === "resume") void primeChime();
    const id = action === "start" ? crypto.randomUUID() : (sessionId ?? crypto.randomUUID());
    ws.send(JSON.stringify({ kind: "session_control", action, session_id: id, ts: Date.now() }));
    if (action === "start") {
      setSessionId(id);
      startedAtRef.current = Date.now();
      setElapsedS(0);
      setPhase("warmup");
      setCameraRefused(null);
      setValidationHint(null);
      setValidationCode(null);
      // Fresh session -- don't hold over the last session's readings; a
      // brand new session showing an old heart rate would be exactly the
      // kind of "pretending to have data" the hold-last-good display is
      // meant to avoid.
      smoothedRef.current = { pulse: null, breathing: null, hrv: null, eda: null, conf: null };
      lastGoodRef.current = { pulse: null, breathing: null, hrv: null, eda: null };
      highBreathingAlertRef.current = { armed: true, lastAt: 0 };
      uiUpdateAtRef.current = 0;
      setPulse(null);
      setBreathing(null);
      setHrv(null);
      setEda(null);
      setConf(null);
      void startPreview({ protectSensingCamera: true });
    } else if (action === "end") {
      setPhase("ended");
      setSessionId(null);
      setState(null);
      setAlert(null);
      setGuide(null);
      setBreathingExercise(null);
      highBreathingAlertRef.current = { armed: true, lastAt: 0 };
      setCameraRefused(null);
      stopPreview();
    } else {
      setPhase(action === "pause" ? "paused" : "active");
    }
  }

  function stopPreview() {
    previewStreamRef.current?.getTracks().forEach((t) => t.stop());
    previewStreamRef.current = null;
    if (videoRef.current) videoRef.current.srcObject = null;
    setPreviewOn(false);
    setPreviewStatus("idle");
    setPreviewMessage("preview off");
    setPreviewDeviceLabel(null);
  }

  async function getVideoInputs(): Promise<MediaDeviceInfo[]> {
    if (!navigator.mediaDevices?.enumerateDevices) return [];
    const devices = await navigator.mediaDevices.enumerateDevices();
    return devices.filter((device) => device.kind === "videoinput");
  }

  async function openPreviewStream(device: MediaDeviceInfo | null): Promise<MediaStream> {
    const video =
      device?.deviceId
        ? { deviceId: { exact: device.deviceId }, width: { ideal: 640 }, height: { ideal: 360 } }
        : { facingMode: "user", width: { ideal: 640 }, height: { ideal: 360 } };
    return navigator.mediaDevices.getUserMedia({ video, audio: false });
  }

  // Camera preview thumbnail -- separate from SmartSpectra. During live
  // sensing, prefer the integrated webcam so the HD Webcam stays dedicated
  // to the agent; if only the sensing-looking camera is available, hold the
  // preview off instead of stealing the signal.
  async function startPreview(opts: { protectSensingCamera: boolean }) {
    if (previewOn || previewStatus === "starting") return;
    if (!navigator.mediaDevices?.getUserMedia) {
      setPreviewStatus("blocked");
      setPreviewMessage("camera preview unavailable");
      return;
    }

    setPreviewStatus("starting");
    setPreviewMessage("choosing camera...");

    let stream: MediaStream | null = null;
    try {
      let devices = await getVideoInputs();
      let choice = choosePreviewDevice(devices, opts.protectSensingCamera);
      if (opts.protectSensingCamera && !choice) {
        setPreviewStatus("blocked");
        setPreviewMessage("preview held to protect sensing camera");
        return;
      }
      stream = await openPreviewStream(choice);

      // Labels often appear only after permission is granted. Once they do,
      // switch to the integrated webcam if the first stream grabbed the same
      // external camera the agent is likely using.
      devices = await getVideoInputs();
      const integrated = devices.find(isLikelyIntegratedCamera);
      const selectedId = stream.getVideoTracks()[0]?.getSettings().deviceId;
      let selectedLabel = stream.getVideoTracks()[0]?.label || choice?.label || "camera";

      if (opts.protectSensingCamera && integrated?.deviceId && selectedId !== integrated.deviceId) {
        stream.getTracks().forEach((track) => track.stop());
        choice = integrated;
        stream = await openPreviewStream(integrated);
        selectedLabel = stream.getVideoTracks()[0]?.label || integrated.label;
      }

      if (opts.protectSensingCamera && isLikelySensingCamera({ label: selectedLabel }) && !isLikelyIntegratedCamera({ label: selectedLabel })) {
        stream.getTracks().forEach((track) => track.stop());
        setPreviewStatus("blocked");
        setPreviewMessage("preview held to protect sensing camera");
        return;
      }

      previewStreamRef.current = stream;
      if (videoRef.current) videoRef.current.srcObject = stream;
      setPreviewDeviceLabel(selectedLabel);
      setPreviewMessage(isLikelyIntegratedCamera({ label: selectedLabel }) ? "showing integrated webcam" : "camera preview live");
      setPreviewStatus("live");
      setPreviewOn(true);
    } catch {
      stream?.getTracks().forEach((track) => track.stop());
      setPreviewStatus("blocked");
      setPreviewMessage("camera preview blocked");
    }
  }

  function togglePreview() {
    if (previewOn) {
      stopPreview();
      return;
    }
    void startPreview({ protectSensingCamera: isRunning });
  }

  useEffect(() => {
    return () => previewStreamRef.current?.getTracks().forEach((t) => t.stop());
  }, []);

  useEffect(() => {
    if (previewOn && videoRef.current && previewStreamRef.current) {
      videoRef.current.srcObject = previewStreamRef.current;
    }
  }, [previewOn]);

  const currentColor = colorVar(state?.state ?? null);
  const isRunning = phase === "warmup" || phase === "active" || phase === "paused";
  const isPreviewing = previewState !== null;
  const panelVisible = isRunning || isPreviewing;
  const isLost = state?.state === "no_signal";

  const trend = useMemo(() => {
    const tail = pulseSeries.values.slice(-SPARK_TAIL).filter((v): v is number => v != null);
    if (isLost || tail.length < 2) return { text: "no signal", color: "var(--mute)" };
    const delta = +(tail[tail.length - 1] - tail[0]).toFixed(1);
    const text = `${delta > 0 ? "+" : ""}${delta.toFixed(1)} recently`;
    const color = delta > 1.5 ? "var(--spiral-ink)" : delta < -1.5 ? "var(--zoned-ink)" : "var(--mute)";
    return { text, color };
  }, [pulseSeries, pulse, isLost]);

  const packetAgeS = lastPacketAt != null ? Math.max(0, Math.round((now - lastPacketAt) / 1000)) : null;
  const streaming = packetAgeS != null && packetAgeS < 5;

  // Freshness-faded colors for the pulse/breathing readouts and plots --
  // full state color right after a real reading, easing to mute the
  // longer it's been held. Preview mode has no real "staleness" concept
  // (it's synthetic data on a timer), so it always shows full color.
  const stateStroke = strokeFor(state?.state ?? null);
  const pulseAgeMs = lastGoodRef.current.pulse != null ? now - lastGoodRef.current.pulse : null;
  const breathingAgeMs = lastGoodRef.current.breathing != null ? now - lastGoodRef.current.breathing : null;
  const pulseColor = isPreviewing ? stateStroke : agedColor(stateStroke, pulseAgeMs);
  const breathingColor = isPreviewing ? stateStroke : agedColor(stateStroke, breathingAgeMs);

  const effectiveAlert =
    alert ?? (previewAlertOn ? { ...DEMO_ALERT[state?.state === "spiraling" ? "spiral" : "zone_out"], ts: Date.now() } : null);
  const alertMood = effectiveAlert?.type === "spiral" ? "spiral" : "zone_out";
  const alertCopy = ALERT_COPY[alertMood];
  const disconnected = !connected && !isPreviewing;
  const cameraBlocked = cameraRefused && !isPreviewing;
  const showDemoControls = !demoUiHidden && demoControlsOpen;

  function dismissAlert() {
    setAlert(null);
    setPreviewAlertOn(false);
  }

  function startBreathingExerciseFromAlert() {
    const source: BreathingExerciseSource = effectiveAlert?.reasons.some((reason) => reason.includes("breathing")) ? "high_breathing" : "alert";
    setBreathingExercise({
      mode: alertMood === "spiral" ? "calm" : "reset",
      source,
      measuredRpm: breathingRef.current ?? guide?.measured_rpm ?? null,
      startedAt: Date.now(),
    });
    dismissAlert();
  }

  // Roving-tabindex radiogroup for the preview-state segmented control, per
  // the handoff's accessibility spec (Arrow/Home/End move focus with
  // selection).
  const previewBtnRefs = useRef<(HTMLButtonElement | null)[]>([]);
  const allPreviewKeys: (PreviewKey | "live")[] = ["live", ...PREVIEW_OPTIONS.map((o) => o.key)];
  function focusPreviewIndex(i: number) {
    const clamped = (i + allPreviewKeys.length) % allPreviewKeys.length;
    previewBtnRefs.current[clamped]?.focus();
  }
  function onPreviewKeyDown(e: React.KeyboardEvent, index: number) {
    if (e.key === "ArrowRight" || e.key === "ArrowDown") {
      e.preventDefault();
      const next = (index + 1) % allPreviewKeys.length;
      const key = allPreviewKeys[next];
      setPreviewState(key === "live" ? null : key);
      focusPreviewIndex(next);
    } else if (e.key === "ArrowLeft" || e.key === "ArrowUp") {
      e.preventDefault();
      const prev = (index - 1 + allPreviewKeys.length) % allPreviewKeys.length;
      const key = allPreviewKeys[prev];
      setPreviewState(key === "live" ? null : key);
      focusPreviewIndex(prev);
    } else if (e.key === "Home") {
      e.preventDefault();
      setPreviewState(null);
      focusPreviewIndex(0);
    } else if (e.key === "End") {
      e.preventDefault();
      const last = allPreviewKeys.length - 1;
      const key = allPreviewKeys[last];
      setPreviewState(key === "live" ? null : key);
      focusPreviewIndex(last);
    }
  }

  return (
    <div className={styles.theme}>
      <div className={styles.header}>
        <div className={styles.headerLeft}>
          <div className={styles.stateDot} style={{ background: state ? currentColor : "var(--tick)" }} />
          <span className={styles.title}>{isRunning ? "Active tracker" : isPreviewing ? "Tracker preview" : "Tracker"}</span>
          {isRunning && <span className={`${styles.elapsed} ${styles.num}`}>{formatElapsed(elapsedS)}</span>}
        </div>
        <div className={styles.headerActions}>
          {!demoUiHidden && (
            <div className={styles.demoWrap}>
              <button
                className={`${styles.btn} ${styles.btnSecondary} ${styles.demoToggle}`}
                aria-expanded={showDemoControls}
                aria-controls="session-demo-controls"
                onClick={() => setDemoControlsOpen((open) => !open)}
              >
                Try demo
              </button>
              {showDemoControls && (
                <div id="session-demo-controls" className={styles.demoPanel}>
                  <div className={styles.previewGroup}>
                    <span id="preview-state-label" className={styles.previewLabel}>
                      Preview state
                    </span>
                    <div role="radiogroup" aria-labelledby="preview-state-label" className={styles.previewSeg}>
                      <button
                        ref={(el) => {
                          previewBtnRefs.current[0] = el;
                        }}
                        role="radio"
                        aria-checked={!isPreviewing}
                        tabIndex={!isPreviewing ? 0 : -1}
                        className={`${styles.previewChip} ${!isPreviewing ? styles.previewChipActive : ""}`}
                        onClick={() => setPreviewState(null)}
                        onKeyDown={(e) => onPreviewKeyDown(e, 0)}
                      >
                        live
                      </button>
                      {PREVIEW_OPTIONS.map((o, i) => (
                        <button
                          key={o.key}
                          ref={(el) => {
                            previewBtnRefs.current[i + 1] = el;
                          }}
                          role="radio"
                          aria-checked={previewState === o.key}
                          tabIndex={previewState === o.key ? 0 : -1}
                          className={`${styles.previewChip} ${previewState === o.key ? styles.previewChipActive : ""}`}
                          onClick={() => setPreviewState(o.key)}
                          onKeyDown={(e) => onPreviewKeyDown(e, i + 1)}
                        >
                          {o.label}
                        </button>
                      ))}
                    </div>
                  </div>
                  <button
                    className={`${styles.btn} ${styles.btnQuiet} ${styles.previewInterventionBtn}`}
                    onClick={() =>
                      setPreviewAlertOn((v) => {
                        const next = !v;
                        // Preview never routes through the real WsMessage "alert" handler
                        // (that's the only place playChime() is normally called), so fire
                        // it here directly -- otherwise "Preview intervention" shows the
                        // card silently, which looks exactly like a broken chime.
                        if (next) void playChime(state?.state === "spiraling" ? "spiral" : "zone_out");
                        return next;
                      })
                    }
                  >
                    {previewAlertOn ? "Hide intervention" : "Preview intervention"}
                  </button>
                </div>
              )}
            </div>
          )}
          {!isRunning && (
            <button className={`${styles.btn} ${styles.btnPrimary}`} onClick={() => send("start")} disabled={!connected}>
              Start tracker
            </button>
          )}
          {isRunning && phase !== "paused" && (
            <button className={`${styles.btn} ${styles.btnSecondary}`} onClick={() => send("pause")}>
              Pause
            </button>
          )}
          {phase === "paused" && (
            <button className={`${styles.btn} ${styles.btnSecondary}`} onClick={() => send("resume")}>
              Resume
            </button>
          )}
          {isRunning && (
            <button className={`${styles.btn} ${styles.btnQuiet}`} onClick={() => send("end")}>
              End tracker
            </button>
          )}
        </div>
      </div>
      {isPreviewing && (
        <div className={styles.previewCaption}>
          Preview only &mdash; the badge, plots and readouts below show placeholder data for {previewState}. Not connected to the
          camera.
        </div>
      )}

      {cameraBlocked ? (
        <div className={styles.edgeState} style={{ background: "var(--none-hatch)" }}>
          <p style={{ fontSize: 18, marginBottom: 8 }}>No camera, no reading.</p>
          <p style={{ fontSize: 13.5, color: "var(--body)", marginBottom: 16, maxWidth: "44ch", marginLeft: "auto", marginRight: "auto" }}>
            Flow can&apos;t infer anything without the frames, and won&apos;t pretend otherwise. ({cameraRefused})
          </p>
          <button className={`${styles.btn} ${styles.btnPrimary}`} onClick={() => window.location.reload()}>
            Reload the page
          </button>
        </div>
      ) : disconnected ? (
        <div className={styles.edgeState}>
          <div className={styles.edgeDot} />
          <p style={{ fontSize: 18, marginBottom: 8 }}>Flow isn&apos;t listening yet.</p>
          <p style={{ fontSize: 13.5, color: "var(--body)", marginBottom: 16 }}>
            Start the local agent, then this page will connect on its own.
          </p>
          <span className={styles.chip}>run.bat</span>
        </div>
      ) : !panelVisible ? (
        <div className={styles.edgeState}>
          <p style={{ fontSize: 18 }}>Ready when you are.</p>
          <p style={{ fontSize: 13.5, color: "var(--body)", marginTop: 8, maxWidth: "48ch", margin: "8px auto" }}>
            Camera-based physiological sensing — not a medical device, no diagnosis. Four minutes to learn your
            baseline, then Flow starts reading.
          </p>
        </div>
      ) : (
        <div className={`${styles.plotsWrap} ${effectiveAlert ? styles.plotsDimmed : ""}`}>
          <div className={styles.grid}>
            <div>
              {state && (
                <>
                  <div className={styles.badgeRow}>
                    <div className={styles.badgeSwatch} style={{ background: currentColor }} />
                    <span className={styles.badgeName}>{state.state}</span>
                    {isPreviewing && <span className={styles.previewTag}>preview</span>}
                  </div>
                  <div className={styles.stateHeadline}>
                    {state.state === "warmup" ? "Learning your baseline" : narrativeFor(state.state)}
                  </div>
                  <div className={styles.sinceLine}>since {readableState(state.state)} began</div>
                  {state.reasons.length > 0 && (
                    <>
                      <div className={styles.reasonsLabel}>What it saw</div>
                      {state.reasons.map((r, i) => (
                        <div key={i} className={styles.reasonRow}>
                          {r.replace(/_/g, " ")}
                        </div>
                      ))}
                    </>
                  )}
                </>
              )}

              <div className={styles.plotBlock} style={{ marginTop: 24 }}>
                <div className={styles.plotHeader}>
                  <span className={styles.plotName}>Pulse</span>
                  <span className={`${styles.plotMeta} ${styles.num}`}>rolling 15s</span>
                </div>
                <Waveform
                  series={pulseSeries}
                  color={pulseColor}
                  height={160}
                  lost={isLost}
                  ariaLabel={`Pulse waveform, currently ${pulse != null ? Math.round(pulse) : "unknown"} beats per minute, state ${state?.state ?? "unknown"}`}
                />
              </div>

              <div className={styles.plotBlock}>
                <div className={styles.plotHeader}>
                  <span className={styles.plotName}>Breathing</span>
                  <span className={`${styles.plotMeta} ${styles.num}`}>rolling 15s</span>
                </div>
                <Waveform
                  series={breathSeries}
                  color={breathingColor}
                  height={96}
                  lost={isLost}
                  ariaLabel={`Breathing waveform, currently ${breathing != null ? breathing.toFixed(1) : "unknown"} breaths per minute`}
                />
                {validationCode === CHEST_NOT_VISIBLE_CODE && (
                  <div style={{ fontSize: 12, color: "var(--spiral-ink)", marginTop: 8 }}>
                    ⚠ Move back so your chest is in frame — breathing needs it, pulse doesn&apos;t.
                  </div>
                )}
              </div>

              <div style={{ display: "flex", justifyContent: "space-between", gap: 24, marginTop: 24 }}>
                <div style={{ flex: 1 }}>
                  <div className={styles.railLabel}>On screen</div>
                  <div style={{ fontSize: 19 }}>{appContext?.category ?? "—"}</div>
                  <div style={{ fontSize: 12, color: "var(--mute)", marginTop: 4 }}>
                    {appContext?.app_title ?? "waiting for window data"}
                  </div>
                </div>
                <div style={{ flex: 1 }}>
                  <div className={styles.railLabel}>Signal</div>
                  <div className={styles.confRow}>
                    <div className={styles.confTrack}>
                      <div className={styles.confTick} />
                      <div
                        className={styles.confFill}
                        style={{
                          width: `${Math.max(0, Math.min(1, conf ?? 0)) * 100}%`,
                          background: (conf ?? 0) < VERY_LOW_SIGNAL_THRESHOLD ? "var(--tick)" : currentColor,
                        }}
                      />
                    </div>
                    <span className={`${styles.confValue} ${styles.num}`}>{conf != null ? conf.toFixed(2) : "—"}</span>
                  </div>
                  {(conf ?? 1) < VERY_LOW_SIGNAL_THRESHOLD && (
                    <div style={{ fontSize: 11.5, color: "var(--mute)", marginTop: 4 }}>
                      Signal is very weak; readings may pause if it stays this low.
                    </div>
                  )}
                </div>
              </div>
            </div>

            <div className={styles.rail}>
              <div className={styles.railLabel}>Right now</div>
              <div className={styles.heroRow}>
                <span className={`${styles.heroNum} ${styles.num}`} style={{ color: pulseColor, transition: "color 400ms linear" }}>
                  {pulse != null ? Math.round(pulse) : "—"}
                </span>
                <span className={styles.heroUnit}>bpm</span>
              </div>
              <Sparkline
                series={pulseSeries}
                color={pulseColor}
                height={26}
                ariaLabel="Heart rate over the last forty samples"
              />
              <div className={`${styles.trendLine} ${styles.num}`} style={{ color: trend.color }}>
                {trend.text}
              </div>

              <div style={{ marginTop: 20 }}>
                <div className={styles.metricRow}>
                  <span className={styles.metricLabel}>Variability</span>
                  <Sparkline series={hrvSeries} color={MUTE_STROKE} height={18} ariaLabel="Heart rate variability trend" />
                  <span className={`${styles.metricValue} ${styles.num}`}>{hrv != null ? Math.round(hrv) : "—"} ms</span>
                </div>
                <div className={styles.metricRow}>
                  <span className={styles.metricLabel}>Breathing</span>
                  <Sparkline series={breathSeries} color={MUTE_STROKE} height={18} ariaLabel="Breathing rate trend" />
                  <span
                    className={`${styles.metricValue} ${styles.num}`}
                    style={{ color: breathingColor, transition: "color 400ms linear" }}
                  >
                    {breathing != null ? breathing.toFixed(1) : "—"} /min
                  </span>
                </div>
                <div className={styles.metricRow}>
                  <span className={styles.metricLabel}>Blinks</span>
                  <Sparkline series={blinkSeries} color={MUTE_STROKE} height={18} ariaLabel="Blink detection trend" />
                  <span className={`${styles.metricValue} ${styles.num}`}>
                    {blinkDetected === DetectionStatus.Detected ? "detected" : blinkDetected === DetectionStatus.NotDetected ? "quiet" : "—"}
                  </span>
                </div>
                <div className={styles.metricRow}>
                  <span className={styles.metricLabel}>EDA</span>
                  <Sparkline series={edaSeries} color={MUTE_STROKE} height={18} ariaLabel="Electrodermal activity trend" />
                  <span className={`${styles.metricValue} ${styles.num}`}>{eda != null ? eda.toFixed(2) : "—"} µS</span>
                </div>
              </div>

              <div style={{ marginTop: 20 }}>
                <div className={styles.railLabel}>Camera</div>
                <div
                  style={{
                    width: 160,
                    height: 100,
                    borderRadius: "var(--r-md)",
                    overflow: "hidden",
                    background: previewOn ? "#000" : "var(--none-hatch)",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    marginBottom: 6,
                  }}
                >
                  {previewOn ? (
                    <video ref={videoRef} autoPlay playsInline muted style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                  ) : (
                    <span style={{ fontSize: 10.5, color: "var(--mute)" }}>
                      {previewStatus === "starting" ? "camera starting..." : previewMessage}
                    </span>
                  )}
                </div>
                <button
                  className={`${styles.btn} ${styles.btnQuiet}`}
                  style={{ fontSize: 11.5, padding: "4px 10px" }}
                  onClick={togglePreview}
                  disabled={previewStatus === "starting"}
                >
                  {previewOn ? "Stop camera" : previewStatus === "starting" ? "Starting..." : "Show camera"}
                </button>
                <div
                  style={{
                    fontSize: 10.5,
                    color: previewStatus === "blocked" ? "var(--spiral-ink)" : "var(--mute)",
                    marginTop: 6,
                    maxWidth: 160,
                  }}
                >
                  {previewDeviceLabel ?? previewMessage}
                </div>
                {validationHint && (
                  <div style={{ fontSize: 11, color: "var(--spiral-ink)", marginTop: 8, maxWidth: 160 }}>⚠ {validationHint}</div>
                )}
              </div>

              <div className={styles.streamRow}>
                <span className={styles.streamDot} style={{ background: streaming ? currentColor : "var(--tick)" }} />
                <div>
                  <div style={{ fontSize: 12.5, fontWeight: 600 }}>{streaming ? "Agent streaming" : "Agent idle"}</div>
                  <div className={`${styles.railLabel} ${styles.num}`} style={{ marginBottom: 0 }}>
                    {packetAgeS != null ? `last packet ${packetAgeS}s ago` : "no packets yet"}
                  </div>
                </div>
              </div>

              {probe && (
                <div className={styles.probeBlock}>
                  <div className={styles.probeQuestion}>Where are you right now?</div>
                  <div className={styles.probeActions}>
                    <button
                      className={styles.probeFocusBtn}
                      style={{ boxShadow: `inset 0 0 0 1px ${currentColor}` }}
                      onClick={() => respondToProbe("focused")}
                    >
                      Focused
                    </button>
                    <button className={`${styles.btn} ${styles.btnSecondary}`} onClick={() => respondToProbe("drifting")}>
                      Drifting
                    </button>
                  </div>
                  <div className={styles.probeCountdown}>
                    <svg width="18" height="18" viewBox="0 0 18 18" aria-hidden="true">
                      <circle cx="9" cy="9" r="7" fill="none" stroke="var(--line-soft)" strokeWidth="2" />
                      <circle
                        cx="9"
                        cy="9"
                        r="7"
                        fill="none"
                        stroke={currentColor}
                        strokeWidth="2"
                        strokeDasharray={2 * Math.PI * 7}
                        strokeDashoffset={2 * Math.PI * 7 * (1 - probeSecondsLeft / 20)}
                        transform="rotate(-90 9 9)"
                      />
                    </svg>
                    <span className={`${styles.num}`} style={{ fontSize: 11.5, color: "var(--mute)" }}>
                      {probeSecondsLeft}s &middot; disappears on its own
                    </span>
                  </div>
                  <div style={{ marginTop: 6, fontSize: 11.5, color: "var(--mute)" }}>There&apos;s no wrong answer.</div>
                </div>
              )}

              {guide && (
                <div style={{ marginTop: 24, display: "flex", flexDirection: "column", alignItems: "center" }}>
                  <BreathingPacer guide={guide} />
                  <div style={{ fontSize: 11.5, color: "var(--mute)", marginTop: 8 }}>I:E 1 : {guide.ie_ratio.toFixed(1)}</div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {effectiveAlert && (
        <div
          className={styles.alertCard}
          role="alertdialog"
          aria-label="Intervention"
          style={{ borderTop: `2px solid ${alertMood === "zone_out" ? "var(--zoned)" : "var(--spiral)"}` }}
        >
          <div className={styles.alertHeader} style={{ color: alertMood === "zone_out" ? "var(--zoned-ink)" : "var(--spiral-ink)" }}>
            <span>{effectiveAlert.type}</span>
            <span className={styles.alertMeta}>{alertCopy.meta}</span>
          </div>
          <div className={styles.alertTitle}>{alertCopy.title}</div>
          <div className={styles.alertBody}>
            {effectiveAlert.reasons.map((r) => r.replace(/_/g, " ")).join(", ")}
            {effectiveAlert.duration_s > 0 ? ` - sustained ${effectiveAlert.duration_s}s.` : "."}
          </div>
          <div className={styles.alertActions}>
            <button className={`${styles.btn} ${styles.btnPrimary}`} onClick={startBreathingExerciseFromAlert}>
              {alertCopy.primary}
            </button>
            <button className={`${styles.btn} ${styles.btnSecondary}`} onClick={dismissAlert}>
              {alertCopy.secondary}
            </button>
            <button className={`${styles.btn} ${styles.btnQuiet}`} onClick={dismissAlert}>
              Not now
            </button>
          </div>
          <div style={{ marginTop: 16, fontSize: 11, color: "var(--mute)", lineHeight: 1.5 }}>
            Camera-based physiological sensing. Declining is never scored.
          </div>
        </div>
      )}

      {breathingExercise && (
        <BreathingExerciseWidget
          key={breathingExercise.startedAt}
          request={breathingExercise}
          liveGuide={guide}
          onClose={() => setBreathingExercise(null)}
        />
      )}
    </div>
  );
}

// Soft synthesized chime - no audio asset needed. The audio context is
// resumed from user gestures where possible so later real alerts can sound.
let audioCtx: AudioContext | null = null;
function getAudioContext(): AudioContext | null {
  try {
    if (!audioCtx) audioCtx = new AudioContext();
    return audioCtx;
  } catch {
    return null;
  }
}

async function primeChime(): Promise<void> {
  const ctx = getAudioContext();
  if (!ctx) return;
  if (ctx.state === "suspended") {
    await ctx.resume().catch(() => undefined);
  }
}

async function playChime(type: "zone_out" | "spiral"): Promise<void> {
  try {
    await primeChime();
    const ctx = getAudioContext();
    if (!ctx) return;
    const activeCtx = ctx;
    const now = ctx.currentTime;

    function tone(freq: number, start: number, duration: number, peakGain: number) {
      const osc = activeCtx.createOscillator();
      const gain = activeCtx.createGain();
      osc.type = "sine";
      osc.frequency.value = freq;
      gain.gain.setValueAtTime(0, now + start);
      gain.gain.linearRampToValueAtTime(peakGain, now + start + 0.05);
      gain.gain.exponentialRampToValueAtTime(0.001, now + start + duration);
      osc.connect(gain).connect(activeCtx.destination);
      osc.start(now + start);
      osc.stop(now + start + duration + 0.05);
    }

    if (type === "zone_out") {
      tone(660, 0, 0.35, 0.12);
      tone(880, 0.18, 0.4, 0.12);
    } else {
      tone(520, 0, 0.6, 0.1);
    }
  } catch {
    // Web Audio unavailable or blocked -- the visual alert card still shows.
  }
}

function formatElapsed(s: number): string {
  const m = Math.floor(s / 60);
  const sec = s % 60;
  return `${m}:${sec.toString().padStart(2, "0")}`;
}
