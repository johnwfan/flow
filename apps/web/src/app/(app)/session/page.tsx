"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { WsMessage, AlertMessage, BreathingGuideMessage } from "@flow/shared";
import styles from "./session.module.css";

const WS_URL = process.env.NEXT_PUBLIC_AGENT_WS_URL ?? "ws://localhost:8765";

// State -> design-token color name (see session.module.css .theme block).
// NoSignal deliberately has no entry -- missing data is hatched, never
// colored, per the design handoff.
const STATE_COLOR: Record<string, string> = {
  focused: "deep",
  zoned_out: "zoned",
  spiraling: "spiral",
  warmup: "deep", // "Learning your baseline" uses the deep dot per the handoff's Calibrating edge state
};

// Mirrors session.module.css's .theme block. Duplicated here (rather than
// resolved from the CSS custom property at runtime) because canvas stroke
// colors need a real color string, and the tokens are oklch() values scoped
// to .theme, not :root -- resolving them via a detached probe element would
// need the probe inside that subtree, which is more fragile than just
// keeping one small duplicate map in sync with the CSS file.
const STATE_STROKE: Record<string, string> = {
  deep: "oklch(0.5 0.24 258)",
  zoned: "oklch(0.66 0.038 248)",
  spiral: "oklch(0.63 0.215 32)",
  break: "oklch(0.8 0.105 82)",
};
const MUTE_STROKE = "oklch(0.54 0 0)";

function colorVar(state: string | null, step: "" | "-ink" | "-mid" | "-pale" = ""): string {
  const key = state ? STATE_COLOR[state] : undefined;
  if (!key) return "var(--mute)";
  return `var(--${key}${step})`;
}

function strokeFor(state: string | null): string {
  const key = state ? STATE_COLOR[state] : undefined;
  return key ? STATE_STROKE[key] ?? MUTE_STROKE : MUTE_STROKE;
}

function readableState(state: string): string {
  return state.replace(/_/g, " ");
}

interface RollingSeries {
  values: (number | null)[];
}

const SERIES_LENGTH = 300; // ~15s at 20Hz

function useRollingSeries(): [RollingSeries, (v: number | null) => void] {
  const ref = useRef<RollingSeries>({ values: [] });
  const push = useCallback((v: number | null) => {
    ref.current.values.push(v);
    if (ref.current.values.length > SERIES_LENGTH) ref.current.values.shift();
  }, []);
  return [ref.current, push];
}

function Waveform({ series, color, height }: { series: RollingSeries; color: string; height: number }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    let raf: number;
    const draw = () => {
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
      const min = Math.min(...known);
      const max = Math.max(...known);
      const pad = (max - min) * 0.2 || 1;
      const lo = min - pad;
      const hi = max + pad;
      const stepX = w / (SERIES_LENGTH - 1);
      const offset = SERIES_LENGTH - series.values.length;

      ctx.beginPath();
      let started = false;
      series.values.forEach((v, i) => {
        if (v == null) {
          started = false;
          return;
        }
        const x = (offset + i) * stepX;
        const y = h - ((v - lo) / (hi - lo)) * h;
        if (!started) {
          ctx.moveTo(x, y);
          started = true;
        } else {
          ctx.lineTo(x, y);
        }
      });
      ctx.strokeStyle = color;
      ctx.lineWidth = 2;
      ctx.stroke();

      raf = requestAnimationFrame(draw);
    };
    raf = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(raf);
  }, [series, color]);

  return <canvas ref={canvasRef} className={styles.plotCanvas} style={{ height }} />;
}

export default function SessionPage() {
  const wsRef = useRef<WebSocket | null>(null);
  const [connected, setConnected] = useState(false);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [phase, setPhase] = useState<"idle" | "warmup" | "active" | "paused" | "ended">("idle");
  const [state, setState] = useState<{ state: string; reasons: string[]; confidence: number } | null>(null);
  const [pulse, setPulse] = useState<number | null>(null);
  const [breathing, setBreathing] = useState<number | null>(null);
  const [hrv, setHrv] = useState<number | null>(null);
  const [eda, setEda] = useState<number | null>(null);
  const [conf, setConf] = useState<number | null>(null);
  const [appContext, setAppContext] = useState<{ app_title: string; category: string } | null>(null);
  const [alert, setAlert] = useState<AlertMessage | null>(null);
  const [guide, setGuide] = useState<BreathingGuideMessage | null>(null);
  const [elapsedS, setElapsedS] = useState(0);
  const startedAtRef = useRef<number | null>(null);
  const [validationHint, setValidationHint] = useState<string | null>(null);
  const [cameraRefused, setCameraRefused] = useState<string | null>(null);
  const [previewOn, setPreviewOn] = useState(false);
  const videoRef = useRef<HTMLVideoElement>(null);
  const previewStreamRef = useRef<MediaStream | null>(null);

  const [pulseSeries, pushPulse] = useRollingSeries();
  const [breathSeries, pushBreath] = useRollingSeries();

  useEffect(() => {
    let cancelled = false;
    let retryTimer: ReturnType<typeof setTimeout>;

    function connect() {
      const ws = new WebSocket(WS_URL);
      wsRef.current = ws;
      ws.onopen = () => !cancelled && setConnected(true);
      ws.onclose = () => {
        if (cancelled) return;
        setConnected(false);
        retryTimer = setTimeout(connect, 2000);
      };
      ws.onerror = () => ws.close();
      ws.onmessage = (ev) => {
        const msg = JSON.parse(ev.data) as WsMessage;
        switch (msg.kind) {
          case "sample":
            setPulse(msg.pulse_bpm);
            setBreathing(msg.breathing_rpm);
            setHrv(msg.hrv_ms);
            setEda(msg.eda_us);
            setConf(msg.conf);
            pushPulse(msg.pulse_bpm);
            pushBreath(msg.breathing_rpm);
            break;
          case "state":
            setState({ state: msg.state, reasons: msg.reasons, confidence: msg.confidence });
            if (msg.state === "warmup") setPhase("warmup");
            else if (phase !== "paused") setPhase("active");
            break;
          case "alert":
            setAlert(msg);
            playChime(msg.type);
            break;
          case "app_context":
            setAppContext({ app_title: msg.app_title, category: msg.category });
            break;
          case "breathing_guide":
            setGuide(msg);
            break;
          default: {
            // Diagnostic-only messages outside the frozen WsMessage
            // contract (see ws-server.ts's broadcastRaw / index.ts's
            // debug_validation and debug_error).
            const raw = msg as unknown as { kind: string; hint?: string; reason?: string; fatal?: boolean };
            if (raw.kind === "debug_validation" && raw.hint) {
              setValidationHint(raw.hint);
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

  function send(action: "start" | "end" | "pause" | "resume") {
    const ws = wsRef.current;
    if (!ws || ws.readyState !== WebSocket.OPEN) return;
    const id = action === "start" ? crypto.randomUUID() : sessionId ?? crypto.randomUUID();
    ws.send(JSON.stringify({ kind: "session_control", action, session_id: id, ts: Date.now() }));
    if (action === "start") {
      setSessionId(id);
      startedAtRef.current = Date.now();
      setElapsedS(0);
      setPhase("warmup");
      setCameraRefused(null);
      setValidationHint(null);
    } else if (action === "end") {
      setPhase("ended");
      setSessionId(null);
      setState(null);
      setAlert(null);
      setCameraRefused(null);
    } else {
      setPhase(action === "pause" ? "paused" : "active");
    }
  }

  // Camera preview thumbnail -- a SEPARATE browser-side capture from the
  // agent's own sensing camera. Off by default and manually toggled: on
  // hardware that only supports one consumer at a time, running both at
  // once can make the agent's real capture fail (see PRD risk notes).
  async function togglePreview() {
    if (previewOn) {
      previewStreamRef.current?.getTracks().forEach((t) => t.stop());
      previewStreamRef.current = null;
      setPreviewOn(false);
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: true });
      previewStreamRef.current = stream;
      if (videoRef.current) videoRef.current.srcObject = stream;
      setPreviewOn(true);
    } catch {
      // Permission denied or no camera -- thumbnail just stays a placeholder.
    }
  }

  useEffect(() => {
    return () => previewStreamRef.current?.getTracks().forEach((t) => t.stop());
  }, []);

  const currentColor = colorVar(state?.state ?? null);
  const isRunning = phase === "warmup" || phase === "active" || phase === "paused";

  if (!connected) {
    return (
      <div className={styles.theme}>
        <div className={styles.edgeState}>
          <div className={styles.edgeDot} />
          <p style={{ fontSize: 18, marginBottom: 8 }}>Flow isn&apos;t listening yet.</p>
          <p style={{ fontSize: 13.5, color: "var(--body)", marginBottom: 16 }}>
            Start the local agent, then this page will connect on its own.
          </p>
          <span className={styles.chip}>run.bat</span>
        </div>
      </div>
    );
  }

  if (cameraRefused) {
    return (
      <div className={styles.theme}>
        <div className={styles.edgeState} style={{ background: "var(--none-hatch)" }}>
          <p style={{ fontSize: 18, marginBottom: 8 }}>No camera, no reading.</p>
          <p style={{ fontSize: 13.5, color: "var(--body)", marginBottom: 16, maxWidth: "44ch", marginLeft: "auto", marginRight: "auto" }}>
            Flow can&apos;t infer anything without the frames, and won&apos;t pretend otherwise. ({cameraRefused})
          </p>
          <button className={`${styles.btn} ${styles.btnPrimary}`} onClick={() => window.location.reload()}>
            Reload the page
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className={styles.theme}>
      <div className={styles.header}>
        <div className={styles.headerLeft}>
          <div className={styles.stateDot} style={{ background: state ? currentColor : "var(--tick)" }} />
          <span className={styles.title}>{isRunning ? "Active session" : "Session"}</span>
          {isRunning && <span className={`${styles.elapsed} ${styles.num}`}>{formatElapsed(elapsedS)}</span>}
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          {!isRunning && (
            <button className={`${styles.btn} ${styles.btnPrimary}`} onClick={() => send("start")}>
              Start session
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
              End session
            </button>
          )}
        </div>
      </div>

      {!isRunning ? (
        <div className={styles.edgeState}>
          <p style={{ fontSize: 18 }}>Ready when you are.</p>
          <p style={{ fontSize: 13.5, color: "var(--body)", marginTop: 8, maxWidth: "48ch", margin: "8px auto" }}>
            Camera-based physiological sensing — not a medical device, no diagnosis. Four minutes to learn your
            baseline, then Flow starts reading.
          </p>
        </div>
      ) : (
        <div className={`${styles.plotsWrap} ${alert ? styles.plotsDimmed : ""}`}>
          <div className={styles.grid}>
            <div>
              {state && (
                <>
                  <div className={styles.badgeRow}>
                    <div className={styles.badgeSwatch} style={{ background: currentColor }} />
                    <span className={styles.badgeName}>{state.state}</span>
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
                <Waveform series={pulseSeries} color={strokeFor(state?.state ?? null)} height={160} />
              </div>

              <div className={styles.plotBlock}>
                <div className={styles.plotHeader}>
                  <span className={styles.plotName}>Breathing</span>
                  <span className={`${styles.plotMeta} ${styles.num}`}>rolling 15s</span>
                </div>
                <Waveform series={breathSeries} color={strokeFor(state?.state ?? null)} height={96} />
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
                          background: (conf ?? 0) < 0.55 ? "var(--tick)" : currentColor,
                        }}
                      />
                    </div>
                    <span className={`${styles.confValue} ${styles.num}`}>{conf != null ? conf.toFixed(2) : "—"}</span>
                  </div>
                  {(conf ?? 1) < 0.55 && (
                    <div style={{ fontSize: 11.5, color: "var(--mute)", marginTop: 4 }}>
                      Reading, not interrupting — confidence below threshold.
                    </div>
                  )}
                </div>
              </div>
            </div>

            <div className={styles.rail}>
              <div className={styles.railLabel}>Right now</div>
              <div className={styles.heroRow}>
                <span className={`${styles.heroNum} ${styles.num}`} style={{ color: currentColor }}>
                  {pulse != null ? Math.round(pulse) : "—"}
                </span>
                <span className={styles.heroUnit}>bpm</span>
              </div>

              <div className={styles.metricRow}>
                <span className={styles.metricLabel}>HRV</span>
                <span className={`${styles.metricValue} ${styles.num}`}>{hrv != null ? Math.round(hrv) : "—"} ms</span>
              </div>
              <div className={styles.metricRow}>
                <span className={styles.metricLabel}>Breathing</span>
                <span className={`${styles.metricValue} ${styles.num}`}>
                  {breathing != null ? breathing.toFixed(1) : "—"} /min
                </span>
              </div>
              <div className={styles.metricRow}>
                <span className={styles.metricLabel}>EDA</span>
                <span className={`${styles.metricValue} ${styles.num}`}>{eda != null ? eda.toFixed(2) : "—"} µS</span>
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
                    <span style={{ fontSize: 10.5, color: "var(--mute)" }}>preview off</span>
                  )}
                </div>
                <button className={`${styles.btn} ${styles.btnQuiet}`} style={{ fontSize: 11.5, padding: "4px 10px" }} onClick={togglePreview}>
                  {previewOn ? "Stop preview" : "Preview camera"}
                </button>
                <div style={{ fontSize: 10.5, color: "var(--mute)", marginTop: 6, maxWidth: 160 }}>
                  Stays on this machine. Separate from sensing — may conflict on some webcams.
                </div>
                {validationHint && (
                  <div style={{ fontSize: 11, color: "var(--spiral-ink)", marginTop: 8, maxWidth: 160 }}>⚠ {validationHint}</div>
                )}
              </div>

              {guide && (
                <div style={{ marginTop: 24, display: "flex", flexDirection: "column", alignItems: "center" }}>
                  <div className={styles.pacerWrap}>
                    <div
                      className={styles.pacerRing}
                      style={{
                        width: guide.phase === "inhale" ? 92 : 52,
                        height: guide.phase === "inhale" ? 92 : 52,
                        background: "var(--zoned-pale)",
                        transitionDuration: `${guide.duration_ms}ms`,
                      }}
                    />
                    <span className={styles.pacerLabel}>
                      {guide.phase} {Math.round(guide.duration_ms / 1000)}
                    </span>
                  </div>
                  <div style={{ fontSize: 11.5, color: "var(--mute)", marginTop: 8 }}>
                    I:E 1 : {guide.ie_ratio.toFixed(1)}
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {alert && (
        <div
          className={styles.alertCard}
          role="alertdialog"
          style={{ borderTop: `2px solid ${alert.type === "zone_out" ? "var(--zoned)" : "var(--spiral)"}` }}
        >
          <div
            className={styles.alertHeader}
            style={{ color: alert.type === "zone_out" ? "var(--zoned-ink)" : "var(--spiral-ink)" }}
          >
            <span>{alert.type}</span>
            <span className={styles.alertMeta}>soft chime</span>
          </div>
          <div className={styles.alertTitle}>{alert.type === "zone_out" ? "Still with it?" : "Winding up a bit?"}</div>
          <div className={styles.alertBody}>
            {alert.reasons.map((r) => r.replace(/_/g, " ")).join(", ")} — sustained {alert.duration_s}s.
          </div>
          <div className={styles.alertActions}>
            <button className={`${styles.btn} ${styles.btnPrimary}`} onClick={() => setAlert(null)}>
              {alert.type === "zone_out" ? "Keep going" : "Start the calming loop"}
            </button>
            <button className={`${styles.btn} ${styles.btnSecondary}`} onClick={() => setAlert(null)}>
              Take a break
            </button>
            <button className={`${styles.btn} ${styles.btnQuiet}`} onClick={() => setAlert(null)}>
              Not now
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

// Soft synthesized chime — no audio asset needed. Two tones for zone_out
// (per the "still with it?" nudge), a softer single tone for spiral (the
// calming loop shouldn't start with anything jarring).
let audioCtx: AudioContext | null = null;
function playChime(type: "zone_out" | "spiral"): void {
  try {
    if (!audioCtx) audioCtx = new AudioContext();
    if (audioCtx.state === "suspended") void audioCtx.resume();
    const ctx = audioCtx;
    const now = ctx.currentTime;

    function tone(freq: number, start: number, duration: number, peakGain: number) {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = "sine";
      osc.frequency.value = freq;
      gain.gain.setValueAtTime(0, now + start);
      gain.gain.linearRampToValueAtTime(peakGain, now + start + 0.05);
      gain.gain.exponentialRampToValueAtTime(0.001, now + start + duration);
      osc.connect(gain).connect(ctx.destination);
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

function narrativeFor(state: string): string {
  switch (state) {
    case "focused":
      return "You're in it";
    case "zoned_out":
      return "Drifting a little";
    case "spiraling":
      return "Winding up";
    default:
      return readableState(state);
  }
}
