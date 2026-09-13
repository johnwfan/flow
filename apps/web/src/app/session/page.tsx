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
  deep: "oklch(0.56 0.185 255)",
  zoned: "oklch(0.66 0.038 248)",
  spiral: "oklch(0.63 0.215 32)",
  break: "oklch(0.8 0.105 82)",
};
const MUTE_STROKE = "oklch(0.54 0.022 268)";

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

      // gridlines (matches --line-soft in session.module.css)
      ctx.strokeStyle = "oklch(0.935 0.008 268)";
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
            break;
          case "app_context":
            setAppContext({ app_title: msg.app_title, category: msg.category });
            break;
          case "breathing_guide":
            setGuide(msg);
            break;
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
    } else if (action === "end") {
      setPhase("ended");
      setSessionId(null);
      setState(null);
      setAlert(null);
    } else {
      setPhase(action === "pause" ? "paused" : "active");
    }
  }

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
