"use client";

import { useCallback, useEffect, useRef, useState } from "react";

// Same defaults as apps/agent/thresholds.json's breathing_guide block, so the
// website break matches the pacing of the in-session agent nudge — just run
// for a full 2 minutes instead of 3 short cycles.
const IE_RATIO = 1.5;
const FALLBACK_RPM = 12;
const CYCLE_MS = (60 / FALLBACK_RPM) * 1000; // 5000ms
const INHALE_MS = CYCLE_MS / (1 + IE_RATIO); // 2000ms
const EXHALE_MS = CYCLE_MS - INHALE_MS; // 3000ms
const BREAK_DURATION_MS = 2 * 60 * 1000;

// Client-side fetches can't rely on the server-only API_BASE_URL. In prod,
// Caddy proxies /v1/* on the same origin (see infra/Caddyfile), so the
// relative default ("") is correct there; local dev overrides via
// NEXT_PUBLIC_API_BASE_URL since web (:3000) and api (:3001) aren't proxied.
const API_BASE_URL = process.env["NEXT_PUBLIC_API_BASE_URL"] ?? "";

const INTRO_LINE =
  "Let's take a two minute break. Follow the circle — breathe in as it grows, and out as it shrinks.";

type Phase = "inhale" | "exhale";
type Status = "idle" | "running" | "done";

function formatRemaining(ms: number): string {
  const s = Math.max(0, Math.ceil(ms / 1000));
  const m = Math.floor(s / 60);
  const rem = s % 60;
  return `${m}:${rem.toString().padStart(2, "0")}`;
}

export function BreathingBreak() {
  const [status, setStatus] = useState<Status>("idle");
  const [phase, setPhase] = useState<Phase>("inhale");
  const [remainingMs, setRemainingMs] = useState(BREAK_DURATION_MS);
  const [audioError, setAudioError] = useState<string | null>(null);

  const phaseTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const tickTimer = useRef<ReturnType<typeof setInterval> | null>(null);
  const endAt = useRef<number>(0);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  const clearTimers = useCallback(() => {
    if (phaseTimer.current) clearTimeout(phaseTimer.current);
    if (tickTimer.current) clearInterval(tickTimer.current);
    phaseTimer.current = null;
    tickTimer.current = null;
  }, []);

  const stop = useCallback(
    (finished: boolean) => {
      clearTimers();
      audioRef.current?.pause();
      setStatus(finished ? "done" : "idle");
      setRemainingMs(BREAK_DURATION_MS);
      setPhase("inhale");
    },
    [clearTimers],
  );

  const runPhase = useCallback(
    (next: Phase) => {
      if (Date.now() >= endAt.current) {
        stop(true);
        return;
      }
      setPhase(next);
      const durationMs = next === "inhale" ? INHALE_MS : EXHALE_MS;
      phaseTimer.current = setTimeout(() => runPhase(next === "inhale" ? "exhale" : "inhale"), durationMs);
    },
    [stop],
  );

  const start = useCallback(() => {
    setAudioError(null);
    setStatus("running");
    endAt.current = Date.now() + BREAK_DURATION_MS;
    setRemainingMs(BREAK_DURATION_MS);
    runPhase("inhale");

    tickTimer.current = setInterval(() => {
      setRemainingMs(Math.max(0, endAt.current - Date.now()));
    }, 250);

    // Voice intro — best-effort. If ElevenLabs isn't configured or the
    // request fails, the visual/timer break still runs fine without it.
    fetch(`${API_BASE_URL}/v1/speak`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ text: INTRO_LINE }),
    })
      .then((res) => {
        if (!res.ok) throw new Error(`speak request failed: ${res.status}`);
        return res.blob();
      })
      .then((blob) => {
        const url = URL.createObjectURL(blob);
        const audio = new Audio(url);
        audioRef.current = audio;
        audio.play().catch((err) => setAudioError(`Playback blocked: ${String(err)}`));
      })
      .catch((err) => setAudioError(`Voice unavailable: ${String(err)}`));
  }, [runPhase]);

  // Clean up timers/audio if the component unmounts mid-break.
  useEffect(() => clearTimers, [clearTimers]);

  const scale = status === "running" ? (phase === "inhale" ? 1 : 0.55) : 0.55;
  const transitionMs = phase === "inhale" ? INHALE_MS : EXHALE_MS;

  return (
    <div className="flex flex-col items-center gap-6 py-4">
      <div className="relative flex h-48 w-48 items-center justify-center">
        <div
          className="absolute rounded-full bg-accent-soft"
          style={{
            width: "100%",
            height: "100%",
            transform: `scale(${scale})`,
            transition: status === "running" ? `transform ${transitionMs}ms ease-in-out` : "none",
          }}
        />
        <div className="relative text-center">
          {status === "running" && (
            <>
              <div className="text-sm font-medium uppercase tracking-wide text-accent">
                {phase === "inhale" ? "Breathe in" : "Breathe out"}
              </div>
              <div className="mt-1 text-2xl font-semibold text-ink">{formatRemaining(remainingMs)}</div>
            </>
          )}
          {status === "idle" && <div className="text-sm text-muted">Ready when you are</div>}
          {status === "done" && <div className="text-sm font-medium text-ink">Nice work</div>}
        </div>
      </div>

      {status === "idle" && (
        <button
          onClick={start}
          className="rounded-lg bg-accent px-5 py-2.5 text-sm font-medium text-white transition-colors hover:opacity-90"
        >
          Take a 2 min break
        </button>
      )}
      {status === "running" && (
        <button
          onClick={() => stop(false)}
          className="rounded-lg border border-border px-5 py-2.5 text-sm font-medium text-muted transition-colors hover:bg-accent-soft hover:text-ink"
        >
          Stop
        </button>
      )}
      {status === "done" && (
        <button
          onClick={start}
          className="rounded-lg bg-accent px-5 py-2.5 text-sm font-medium text-white transition-colors hover:opacity-90"
        >
          Do it again
        </button>
      )}

      {audioError && <p className="text-xs text-muted">{audioError} (the break still runs without voice.)</p>}
    </div>
  );
}
