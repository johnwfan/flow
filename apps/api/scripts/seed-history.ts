/**
 * Seeds a believable history of past Flow sessions for demoing the Sessions
 * and Patterns pages.
 *
 * The data is intentionally patterned, not random:
 * - Short communication checks create long re-entry tails.
 * - Sessions after 3pm settle slower and drop earlier.
 * - Blocks pushed past ~50 minutes tend to show late drift.
 *
 * Usage: pnpm --filter @flow/api seed:history
 * Env:
 *   DEMO_DEVICE_ID=demo-device
 *   DEMO_HISTORY_SESSIONS=24
 *   DEMO_HISTORY_APPEND=1   # append instead of replacing this device history
 *   DEMO_HISTORY_DRY_RUN=1  # build the history plan without touching the DB
 */
import type { PoolClient } from "pg";
import { Category, DetectionStatus, State } from "@flow/shared";
import { createPool } from "../src/db/pool.js";

const DEVICE_ID = process.env["DEMO_DEVICE_ID"] ?? "demo-device";
const DEFAULT_SESSION_COUNT = 24;
const SESSION_COUNT = parsePositiveInt(process.env["DEMO_HISTORY_SESSIONS"], DEFAULT_SESSION_COUNT);
const SHOULD_RESET = process.env["DEMO_HISTORY_APPEND"] !== "1";
const DRY_RUN = process.env["DEMO_HISTORY_DRY_RUN"] === "1";
const SAMPLE_OFFSETS_S = [12, 44] as const;
const DRY_RUN_SESSION_ID = "00000000-0000-4000-8000-000000000000";

interface AppPlan {
  title: string;
  category: Category;
}

interface BreakPlan {
  minute: number;
  durationMinutes: number;
  restorative: boolean;
}

interface Recipe {
  daysAgo: number;
  startHour: number;
  startMinute: number;
  totalMinutes: number;
  settleMinutes: number;
  dropMinute: number | null;
  distractor: AppPlan;
  distractState: State.ZonedOut | State.Spiraling;
  distractMinutes: number;
  refocusMinutes: number;
  glanceSeconds: number;
  task: AppPlan;
  break?: BreakPlan;
  signalLossMinute?: number;
}

interface MinutePlan {
  state: State;
  app: AppPlan;
}

interface ContextPoint {
  ts: number;
  app: AppPlan;
}

interface StateRun {
  state: State;
  startMinute: number;
  minutes: number;
  app: AppPlan;
}

const APPS = {
  notion: { title: "Notion - research notes", category: Category.Study },
  cursor: { title: "Cursor - Flow feature branch", category: Category.Productivity },
  paper: { title: "Zotero - attention paper", category: Category.Study },
  anki: { title: "Anki - review queue", category: Category.Study },
  docs: { title: "Browser - course docs", category: Category.Study },
  figma: { title: "Figma - session wireframes", category: Category.Productivity },
  slack: { title: "Slack - #project-lab", category: Category.Communication },
  messages: { title: "Messages - group chat", category: Category.Communication },
  email: { title: "Gmail - inbox", category: Category.Communication },
  calendar: { title: "Google Calendar - week view", category: Category.Productivity },
  youtube: { title: "YouTube - music tab", category: Category.Entertainment },
  reddit: { title: "Reddit - r/GetStudying", category: Category.Social },
  locked: { title: "Screen locked", category: Category.System },
} satisfies Record<string, AppPlan>;

const BASE_RECIPES: Recipe[] = [
  recipe(1, 9, 10, 54, 4, 50, APPS.slack, State.ZonedOut, 1, 7, 10, APPS.notion),
  recipe(2, 16, 20, 67, 10, 28, APPS.messages, State.ZonedOut, 2, 9, 20, APPS.cursor),
  recipe(3, 10, 0, 58, 5, 51, APPS.slack, State.ZonedOut, 1, 6, 10, APPS.paper),
  recipe(4, 15, 35, 76, 12, 30, APPS.youtube, State.Spiraling, 4, 14, 210, APPS.docs, {
    minute: 56,
    durationMinutes: 5,
    restorative: false,
  }),
  recipe(5, 8, 45, 45, 3, null, APPS.calendar, State.ZonedOut, 0, 0, 0, APPS.anki),
  recipe(6, 19, 10, 50, 11, 24, APPS.reddit, State.Spiraling, 3, 12, 180, APPS.docs),
  recipe(8, 9, 0, 62, 4, 48, APPS.calendar, State.ZonedOut, 2, 3, 45, APPS.cursor),
  recipe(9, 13, 15, 55, 6, 44, APPS.slack, State.ZonedOut, 1, 5, 10, APPS.notion),
  recipe(10, 17, 0, 72, 12, 31, APPS.slack, State.ZonedOut, 1, 8, 10, APPS.figma),
  recipe(11, 11, 30, 52, 5, 49, APPS.email, State.ZonedOut, 1, 4, 25, APPS.paper),
  recipe(12, 14, 45, 64, 7, 42, APPS.reddit, State.ZonedOut, 2, 10, 120, APPS.docs),
  recipe(13, 9, 20, 61, 4, 53, APPS.messages, State.ZonedOut, 1, 6, 20, APPS.cursor),
  recipe(15, 16, 10, 70, 10, 32, APPS.youtube, State.Spiraling, 3, 13, 180, APPS.notion),
  recipe(16, 10, 5, 48, 4, null, APPS.slack, State.ZonedOut, 0, 0, 0, APPS.anki),
  recipe(17, 8, 30, 57, 3, 52, APPS.slack, State.ZonedOut, 1, 6, 10, APPS.paper, undefined, 22),
  recipe(18, 18, 5, 63, 13, 25, APPS.reddit, State.Spiraling, 3, 14, 180, APPS.docs),
  recipe(19, 12, 40, 50, 6, 43, APPS.calendar, State.ZonedOut, 1, 2, 35, APPS.figma),
  recipe(20, 15, 10, 75, 9, 34, APPS.messages, State.ZonedOut, 2, 8, 20, APPS.cursor, {
    minute: 48,
    durationMinutes: 5,
    restorative: true,
  }),
  recipe(22, 9, 50, 65, 5, 50, APPS.slack, State.ZonedOut, 1, 7, 10, APPS.notion),
  recipe(23, 14, 5, 52, 6, 40, APPS.youtube, State.ZonedOut, 2, 11, 150, APPS.docs),
  recipe(24, 7, 55, 46, 3, null, APPS.email, State.ZonedOut, 0, 0, 0, APPS.anki),
  recipe(25, 16, 45, 69, 12, 29, APPS.slack, State.ZonedOut, 1, 9, 10, APPS.figma),
  recipe(26, 11, 0, 60, 5, 47, APPS.reddit, State.ZonedOut, 2, 12, 120, APPS.paper),
  recipe(27, 9, 30, 55, 4, 49, APPS.messages, State.ZonedOut, 1, 5, 20, APPS.cursor),
];

function recipe(
  daysAgo: number,
  startHour: number,
  startMinute: number,
  totalMinutes: number,
  settleMinutes: number,
  dropMinute: number | null,
  distractor: AppPlan,
  distractState: State.ZonedOut | State.Spiraling,
  distractMinutes: number,
  refocusMinutes: number,
  glanceSeconds: number,
  task: AppPlan,
  breakPlan?: BreakPlan,
  signalLossMinute?: number,
): Recipe {
  return {
    daysAgo,
    startHour,
    startMinute,
    totalMinutes,
    settleMinutes,
    dropMinute,
    distractor,
    distractState,
    distractMinutes,
    refocusMinutes,
    glanceSeconds,
    task,
    break: breakPlan,
    signalLossMinute,
  };
}

function parsePositiveInt(raw: string | undefined, fallback: number): number {
  if (!raw) return fallback;
  const parsed = Number.parseInt(raw, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function recipesFor(count: number): Recipe[] {
  if (count <= BASE_RECIPES.length) return BASE_RECIPES.slice(0, count);
  const recipes = [...BASE_RECIPES];
  for (let i = BASE_RECIPES.length; i < count; i += 1) {
    const source = BASE_RECIPES[i % BASE_RECIPES.length]!;
    const cycle = Math.floor(i / BASE_RECIPES.length);
    recipes.push({
      ...source,
      daysAgo: source.daysAgo + cycle * 28,
      startMinute: (source.startMinute + cycle * 7) % 60,
    });
  }
  return recipes;
}

function startDateFor(recipe: Recipe): Date {
  const d = new Date();
  d.setHours(recipe.startHour, recipe.startMinute, 0, 0);
  d.setDate(d.getDate() - recipe.daysAgo);
  if (d.getTime() >= Date.now()) d.setDate(d.getDate() - 1);
  return d;
}

function addMinutes(ts: number, minutes: number): number {
  return ts + minutes * 60_000;
}

function setRange(minutes: MinutePlan[], start: number, duration: number, state: State, app: AppPlan): void {
  const end = Math.min(minutes.length, start + duration);
  for (let m = Math.max(0, start); m < end; m += 1) {
    minutes[m] = { state, app };
  }
}

function buildMinutePlan(recipe: Recipe): MinutePlan[] {
  const minutes: MinutePlan[] = Array.from({ length: recipe.totalMinutes }, () => ({
    state: State.Focused,
    app: recipe.task,
  }));

  setRange(minutes, 0, recipe.settleMinutes, State.Warmup, recipe.task);

  if (recipe.dropMinute !== null && recipe.distractMinutes > 0) {
    setRange(minutes, recipe.dropMinute, recipe.distractMinutes, recipe.distractState, recipe.distractor);
    setRange(
      minutes,
      recipe.dropMinute + recipe.distractMinutes,
      recipe.refocusMinutes,
      State.Warmup,
      recipe.task,
    );
  }

  const lateStart = Math.max(
    50,
    recipe.dropMinute === null
      ? 50
      : recipe.dropMinute + recipe.distractMinutes + recipe.refocusMinutes + 8,
  );
  if (recipe.totalMinutes >= 58 && lateStart + 7 < recipe.totalMinutes) {
    const isLateDay = recipe.startHour >= 15;
    const lateApp = isLateDay ? APPS.youtube : APPS.slack;
    setRange(minutes, lateStart, isLateDay ? 4 : 2, isLateDay ? State.Spiraling : State.ZonedOut, lateApp);
    setRange(minutes, lateStart + (isLateDay ? 4 : 2), isLateDay ? 6 : 3, State.Warmup, recipe.task);
  }

  if (recipe.break) {
    const resumeMinute = recipe.break.minute + recipe.break.durationMinutes;
    setRange(minutes, recipe.break.minute, recipe.break.durationMinutes, State.NoSignal, APPS.locked);
    if (recipe.break.restorative) {
      setRange(minutes, resumeMinute, 1, State.Warmup, recipe.task);
      setRange(minutes, resumeMinute + 1, Math.max(0, recipe.totalMinutes - resumeMinute - 1), State.Focused, recipe.task);
    } else {
      setRange(minutes, resumeMinute, 4, State.ZonedOut, recipe.distractor);
      setRange(minutes, resumeMinute + 4, 4, State.Warmup, recipe.task);
    }
  }

  if (recipe.signalLossMinute !== undefined) {
    setRange(minutes, recipe.signalLossMinute, 1, State.NoSignal, APPS.locked);
  }

  return minutes;
}

function groupStateRuns(minutes: MinutePlan[]): StateRun[] {
  const runs: StateRun[] = [];
  for (let i = 0; i < minutes.length; i += 1) {
    const minute = minutes[i]!;
    const last = runs[runs.length - 1];
    if (last && last.state === minute.state && last.app.title === minute.app.title) {
      last.minutes += 1;
    } else {
      runs.push({ state: minute.state, app: minute.app, startMinute: i, minutes: 1 });
    }
  }
  return runs;
}

function stateConfidence(state: State): number {
  switch (state) {
    case State.Focused:
      return 0.9;
    case State.ZonedOut:
      return 0.82;
    case State.Spiraling:
      return 0.84;
    case State.Warmup:
      return 0.58;
    case State.NoSignal:
      return 0.24;
  }
}

function stateReasons(state: State, app: AppPlan): string[] {
  switch (state) {
    case State.Focused:
      return ["gaze_on_task", "breathing_settled", "low_app_switching"];
    case State.ZonedOut:
      return app.category === Category.Communication
        ? ["quick_message_check", "blink_rate_down", "re_entry_tail_started"]
        : ["off_task_window", "gaze_parked", "scrolling_detected"];
    case State.Spiraling:
      return ["breathing_climbed", "rapid_switching", "heart_rate_up"];
    case State.Warmup:
      return ["baseline_settling", "attention_rebuilding"];
    case State.NoSignal:
      return ["face_not_visible", "not_interpolated"];
  }
}

function buildContextTimeline(recipe: Recipe, startMs: number, minutes: MinutePlan[]): ContextPoint[] {
  const points: ContextPoint[] = [{ ts: startMs, app: recipe.task }];
  const runs = groupStateRuns(minutes);

  for (const run of runs) {
    const ts = addMinutes(startMs, run.startMinute);
    const previous = points[points.length - 1]!;
    if (previous.app.title !== run.app.title || previous.app.category !== run.app.category) {
      points.push({ ts, app: run.app });
    }

    const isPrimaryDistractor = run.app.title === recipe.distractor.title;
    const runSeconds = run.minutes * 60;
    if (isPrimaryDistractor && recipe.glanceSeconds > 0 && recipe.glanceSeconds < runSeconds) {
      points.push({ ts: ts + recipe.glanceSeconds * 1000, app: recipe.task });
    }
  }

  return points
    .sort((a, b) => a.ts - b.ts)
    .filter((point, index, sorted) => {
      const prev = sorted[index - 1];
      return !prev || prev.ts !== point.ts || prev.app.title !== point.app.title;
    });
}

function contextAt(points: ContextPoint[], ts: number): AppPlan {
  let current = points[0]!.app;
  for (const point of points) {
    if (point.ts <= ts) current = point.app;
    else break;
  }
  return current;
}

function makeRng(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (1664525 * state + 1013904223) >>> 0;
    return state / 0x100000000;
  };
}

function jitter(rng: () => number, amount: number): number {
  return (rng() - 0.5) * amount;
}

function sampleValues(recipe: Recipe, minute: number, state: State, rng: () => number) {
  if (state === State.NoSignal) {
    return {
      pulse: null,
      breathing: null,
      hrv: null,
      eda: null,
      conf: 0.22 + jitter(rng, 0.04),
      blink: DetectionStatus.Unknown,
    };
  }

  const lateDay = recipe.startHour >= 15 ? 1 : 0;
  const fatigue = Math.max(0, minute - 50);

  const base = {
    [State.Focused]: { pulse: 63, breathing: 12.8, hrv: 82, eda: 0.34, conf: 0.91 },
    [State.ZonedOut]: { pulse: 58, breathing: 11.5, hrv: 91, eda: 0.29, conf: 0.82 },
    [State.Spiraling]: { pulse: 82, breathing: 18.4, hrv: 49, eda: 0.64, conf: 0.84 },
    [State.Warmup]: { pulse: 67, breathing: 14.1, hrv: 68, eda: 0.42, conf: 0.58 },
    [State.NoSignal]: { pulse: 0, breathing: 0, hrv: 0, eda: 0, conf: 0 },
  }[state];

  const pulse = base.pulse + lateDay * 2.5 + fatigue * 0.1 + jitter(rng, 2.2);
  const breathing = base.breathing + lateDay * 0.45 + fatigue * 0.03 + jitter(rng, 0.5);
  const hrv = base.hrv - lateDay * 5 - fatigue * 0.18 + jitter(rng, 4);
  const eda = base.eda + lateDay * 0.04 + fatigue * 0.004 + jitter(rng, 0.04);
  const conf = Math.max(0.2, Math.min(0.98, base.conf + jitter(rng, 0.04)));

  return {
    pulse: Math.round(pulse * 10) / 10,
    breathing: Math.round(breathing * 10) / 10,
    hrv: Math.round(hrv * 10) / 10,
    eda: Math.round(eda * 100) / 100,
    conf: Math.round(conf * 100) / 100,
    blink: state === State.Spiraling || (state === State.Focused && rng() > 0.7)
      ? DetectionStatus.Detected
      : DetectionStatus.NotDetected,
  };
}

function firstRefocusMinutes(minutes: MinutePlan[], recipe: Recipe): number | null {
  if (recipe.dropMinute === null) return null;
  const searchStart = recipe.dropMinute + recipe.distractMinutes;
  for (let m = searchStart; m < minutes.length; m += 1) {
    if (minutes[m]!.state === State.Focused) return m - searchStart;
  }
  return null;
}

function focusMinutes(minutes: MinutePlan[]): number {
  return minutes.filter((m) => m.state === State.Focused).length;
}

function narrativeFor(recipe: Recipe, minutes: MinutePlan[]): string {
  const focus = focusMinutes(minutes);
  const refocus = firstRefocusMinutes(minutes, recipe);
  const settle = recipe.settleMinutes;
  const distractor = recipe.distractor.title.split(" - ")[0] ?? recipe.distractor.title;

  if (recipe.dropMinute === null) {
    return `This was a clean ${recipe.totalMinutes}-minute block: after about ${settle} minutes of warmup, most of the session stayed in deep work. Ending before the late-session fatigue window kept the ribbon simple.`;
  }

  const lateDay = recipe.startHour >= 15;
  const reentry = refocus === null ? "did not fully recover before the session ended" : `took about ${refocus} minutes to settle again`;
  const fatigue =
    recipe.totalMinutes > 55
      ? "The last stretch also softened after the 50-minute mark."
      : "The shorter endpoint kept the second half from fraying much more.";

  return `This ${recipe.totalMinutes}-minute block held ${focus} focused minutes after a ${settle}-minute settle-in. A brief ${distractor} detour ${reentry}, and ${lateDay ? "the later start made that recovery rougher" : "the earlier start helped the recovery stay contained"}. ${fatigue}`;
}

function tipsFor(recipe: Recipe, minutes: MinutePlan[]): string {
  const refocus = firstRefocusMinutes(minutes, recipe);
  const distractor = recipe.distractor.title.split(" - ")[0] ?? recipe.distractor.title;
  const timeTip =
    recipe.startHour >= 15
      ? "Move the hardest task before 3pm; these later sessions settle slower and drop earlier."
      : "Keep using the morning or early afternoon for the highest-stakes block.";
  const appTip =
    refocus === null
      ? "The off-task check landed late enough that the block never fully rebuilt."
      : `Treat ${distractor} as a closed-app item during deep work; the check was short, but re-entry cost about ${refocus} minutes.`;
  const lengthTip =
    recipe.totalMinutes > 55
      ? "Plan a real break around 50 minutes instead of pushing through the fade."
      : "This length is close to the useful edge; stop before the next drift becomes the session.";

  return `${timeTip} ${appTip} ${lengthTip}`;
}

function eventRowsFor(sessionId: string, recipe: Recipe, startMs: number, endMs: number, minutes: MinutePlan[], contexts: ContextPoint[]) {
  const rows: unknown[][] = [
    [
      sessionId,
      new Date(startMs),
      "session_control",
      JSON.stringify({ action: "start", session_id: sessionId }),
    ],
  ];

  for (const point of contexts) {
    rows.push([
      sessionId,
      new Date(point.ts),
      "app_context",
      JSON.stringify({ app_title: point.app.title, category: point.app.category }),
    ]);
  }

  const runs = groupStateRuns(minutes);
  for (const run of runs) {
    const ts = addMinutes(startMs, run.startMinute);
    rows.push([
      sessionId,
      new Date(ts),
      "state",
      JSON.stringify({
        state: run.state,
        reasons: stateReasons(run.state, run.app),
        confidence: stateConfidence(run.state),
      }),
    ]);

    if ((run.state === State.ZonedOut && run.minutes >= 2) || run.state === State.Spiraling) {
      const alertTs = ts + Math.min(60_000, run.minutes * 30_000);
      const isSpiral = run.state === State.Spiraling;
      rows.push([
        sessionId,
        new Date(alertTs),
        "alert",
        JSON.stringify({
          type: isSpiral ? "spiral" : "zone_out",
          reasons: isSpiral
            ? ["breathing_up", "rapid_switching", "heart_rate_climbing"]
            : ["gaze_parked", "blink_rate_down", "off_task_window"],
          duration_s: run.minutes * 60,
        }),
      ]);
      rows.push([
        sessionId,
        new Date(alertTs + 8_000),
        "breathing_guide",
        JSON.stringify({
          phase: "inhale",
          duration_ms: 4000,
          measured_rpm: isSpiral ? 18.8 : 11.8,
          ie_ratio: isSpiral ? 2 : 1,
        }),
      ]);
    }
  }

  const firstDrop = runs.find((run) => run.state === State.ZonedOut || run.state === State.Spiraling);
  if (firstDrop) {
    const response =
      recipe.startHour >= 15 && recipe.distractState === State.ZonedOut
        ? State.Focused
        : firstDrop.state === State.Spiraling
          ? State.Spiraling
          : State.ZonedOut;
    rows.push([
      sessionId,
      new Date(addMinutes(startMs, firstDrop.startMinute) + 90_000),
      "thought_probe",
      JSON.stringify({ classifier_state: firstDrop.state, user_response: response }),
    ]);
  } else {
    rows.push([
      sessionId,
      new Date(addMinutes(startMs, recipe.settleMinutes + 12)),
      "thought_probe",
      JSON.stringify({ classifier_state: State.Focused, user_response: State.Focused }),
    ]);
  }

  if (recipe.break) {
    const pauseTs = addMinutes(startMs, recipe.break.minute);
    const resumeTs = addMinutes(startMs, recipe.break.minute + recipe.break.durationMinutes);
    rows.push([sessionId, new Date(pauseTs), "session_control", JSON.stringify({ action: "pause", session_id: sessionId })]);
    rows.push([sessionId, new Date(resumeTs), "session_control", JSON.stringify({ action: "resume", session_id: sessionId })]);
  }

  rows.push([
    sessionId,
    new Date(endMs),
    "session_control",
    JSON.stringify({ action: "end", session_id: sessionId }),
  ]);

  return rows.sort((a, b) => (a[1] as Date).getTime() - (b[1] as Date).getTime());
}

function sampleRowsFor(sessionId: string, recipe: Recipe, startMs: number, minutes: MinutePlan[], contexts: ContextPoint[], index: number): unknown[][] {
  const rows: unknown[][] = [];
  const rng = makeRng((recipe.daysAgo + 1) * 1000 + index * 97);

  for (let minute = 0; minute < minutes.length; minute += 1) {
    const plan = minutes[minute]!;
    for (const offsetS of SAMPLE_OFFSETS_S) {
      const ts = addMinutes(startMs, minute) + offsetS * 1000;
      const app = contextAt(contexts, ts);
      const values = sampleValues(recipe, minute, plan.state, rng);
      rows.push([
        sessionId,
        DEVICE_ID,
        new Date(ts),
        values.pulse,
        values.breathing,
        values.hrv,
        values.eda,
        values.conf,
        values.blink,
        DetectionStatus.NotDetected,
        plan.state,
        app.category,
        app.title,
      ]);
    }
  }

  return rows;
}

async function insertRows(client: PoolClient, table: string, columns: string[], rows: unknown[][]): Promise<void> {
  if (rows.length === 0) return;
  const values: unknown[] = [];
  const placeholders = rows.map((row) => {
    const cols = row.map((value) => {
      values.push(value);
      return `$${values.length}`;
    });
    return `(${cols.join(", ")})`;
  });
  await client.query(`INSERT INTO ${table} (${columns.join(", ")}) VALUES ${placeholders.join(", ")}`, values);
}

async function resetDeviceHistory(client: PoolClient): Promise<number> {
  const sessions = await client.query<{ id: string }>("SELECT id FROM sessions WHERE device_id = $1", [DEVICE_ID]);
  const ids = sessions.rows.map((row) => row.id);
  if (ids.length === 0) return 0;

  await client.query("DELETE FROM events WHERE session_id = ANY($1::uuid[])", [ids]);
  await client.query("DELETE FROM batch_keys WHERE session_id = ANY($1::uuid[])", [ids]);
  await client.query("DELETE FROM samples WHERE session_id = ANY($1::uuid[])", [ids]);
  await client.query("DELETE FROM sessions WHERE id = ANY($1::uuid[])", [ids]);
  return ids.length;
}

async function seedOne(client: PoolClient, recipe: Recipe, index: number): Promise<string> {
  const startedAt = startDateFor(recipe);
  const startMs = startedAt.getTime();
  const endMs = addMinutes(startMs, recipe.totalMinutes);
  const minutes = buildMinutePlan(recipe);
  const contexts = buildContextTimeline(recipe, startMs, minutes);

  const result = await client.query<{ id: string }>(
    `INSERT INTO sessions (device_id, started_at, ended_at, duration_s, narrative, tips)
     VALUES ($1, $2, $3, $4, $5, $6)
     RETURNING id`,
    [
      DEVICE_ID,
      startedAt,
      new Date(endMs),
      recipe.totalMinutes * 60,
      narrativeFor(recipe, minutes),
      tipsFor(recipe, minutes),
    ],
  );
  const sessionId = result.rows[0]!.id;

  await insertRows(
    client,
    "samples",
    [
      "session_id",
      "device_id",
      "ts",
      "pulse_bpm",
      "breathing_rpm",
      "hrv_ms",
      "eda_us",
      "conf",
      "blink",
      "talking",
      "state",
      "category",
      "app_title",
    ],
    sampleRowsFor(sessionId, recipe, startMs, minutes, contexts, index),
  );

  await insertRows(client, "events", ["session_id", "ts", "kind", "payload"], eventRowsFor(sessionId, recipe, startMs, endMs, minutes, contexts));

  return sessionId;
}

async function main() {
  const recipes = recipesFor(SESSION_COUNT);

  if (DRY_RUN) {
    let sampleCount = 0;
    let eventCount = 0;
    let focusedMinutes = 0;
    for (const [index, recipe] of recipes.entries()) {
      const startMs = startDateFor(recipe).getTime();
      const minutes = buildMinutePlan(recipe);
      const contexts = buildContextTimeline(recipe, startMs, minutes);
      sampleCount += sampleRowsFor(DRY_RUN_SESSION_ID, recipe, startMs, minutes, contexts, index).length;
      eventCount += eventRowsFor(DRY_RUN_SESSION_ID, recipe, startMs, addMinutes(startMs, recipe.totalMinutes), minutes, contexts).length;
      focusedMinutes += focusMinutes(minutes);
    }
    console.log(`[seed-history] dry run built ${recipes.length} session(s) for device ${DEVICE_ID}`);
    console.log(`[seed-history] would insert ${sampleCount} samples, ${eventCount} events, ${focusedMinutes} focused minutes`);
    console.log("[seed-history] no database connection opened");
    return;
  }

  const pool = createPool();
  const client = await pool.connect();
  const created: string[] = [];

  try {
    await client.query("BEGIN");
    if (SHOULD_RESET) {
      const deleted = await resetDeviceHistory(client);
      console.log(`[seed-history] replaced ${deleted} existing session(s) for device ${DEVICE_ID}`);
    }

    for (const [index, recipe] of recipes.entries()) {
      created.push(await seedOne(client, recipe, index));
    }

    await client.query("COMMIT");
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }

  await pool.query("CALL refresh_continuous_aggregate('samples_1min', NULL, NULL)");
  await pool.query("CALL refresh_continuous_aggregate('samples_5min', NULL, NULL)");
  await pool.end();

  console.log(`[seed-history] created ${created.length} past session(s) for device ${DEVICE_ID}`);
  console.log("[seed-history] patterns: communication re-entry cost, after-3pm quality drop, 50-minute fatigue");
  console.log(`[seed-history] newest session id: ${created[0] ?? "none"}`);
}

main().catch((err) => {
  console.error("[seed-history] failed:", err);
  process.exit(1);
});
