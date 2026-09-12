# Flow — PRD

Two developers. One Windows machine. TypeScript end to end.

Flow reads pulse, breathing, blink rate and gaze off a webcam while you work, cross-references it against what is on screen, and catches the state nothing else measures: **eyes on the page, brain gone.** It intervenes in the moment and explains the pattern afterward.

---

## Scope

**In** — single user, single machine, explicit session start and stop, live detection with voice intervention, multi-session dashboard, Gemini narrative, thought-probe validation.

**Out** — auth, accounts, multi-user, social, leaderboards, mobile, cross-platform, screenshots, blood pressure, pupillometry.

No auth is deliberate: the agent generates a `device_id` on first run and that is the identity. Sign-in costs three hours and earns nothing on a single-machine demo.

> **Claim discipline.** The SDK's metrics are for general wellness and are not FDA cleared — the 510(k) covers Presage's separate Vital Signs Monitor app. Never imply clearance for Flow. Say "camera-based physiological sensing," not "medical grade."

---

## Success criteria

### Demo-critical

| Metric | Target | Measured by |
|---|---|---|
| Time to first waveform | < 20 s from start | Stopwatch, 10 cold runs |
| Sensing success rate | ≥ 8 of 10 runs | Confidence > 0.6 held 30 s |
| Pulse accuracy | ± 5 BPM vs phone PPG | Side by side, 5 trials |
| Alert latency | < 3 s from trigger | Log timestamp delta |
| End to dashboard | Visible < 30 s | Manual, 5 runs |
| Crash-free run | 45 min, zero exceptions | Agent log |

### Credibility

| Metric | Target | Why |
|---|---|---|
| Thought-probes collected | ≥ 40 | Sample size a judge won't wave off |
| Classifier agreement | ≥ 70% | Turns a guess into a measurement |
| False-alarm rate | < 1 per 20 min | Over-alerting kills these products |
| I:E shift post-intervention | Measurable | Proves the intervention does something |
| Real recorded hours | ≥ 6 | Seed data that isn't synthetic |

### Product KPIs — for the pitch, not the weekend

Sessions per user per week. Percentage of alerts acted on versus dismissed. Time-to-settle trend across 30 days. Ratio of restorative to depleting breaks.

---

## Stack

**TypeScript everywhere.** Agent, API, and frontend share one `types.ts`, so the WebSocket contract cannot drift between two people working in parallel. That single fact is worth more this weekend than any per-component optimisation.

| Layer | Choice | Why this one |
|---|---|---|
| Agent | Node 20 + SmartSpectra Node binding | First-class supported binding. The heavy pixel work is inside the native SDK regardless of language, so the binding only compares floats and batches JSON — language speed is irrelevant, iteration speed is not. |
| Window tracking | `ffi-napi` → Win32 | `GetForegroundWindow`, `GetWindowTextW`, `GetLastInputInfo`. No permission prompts on Windows, unlike macOS. |
| Live UI | Next.js 15, TypeScript, Tailwind | One codebase, two routes, two deploy targets. |
| Waveforms | uPlot | Non-negotiable. 20 Hz over a 60 s window is 1,200 points redrawn 20×/sec — Recharts builds a React tree per point and drops frames within two minutes. uPlot is canvas, 45 KB. |
| Dashboard charts | Recharts | Static data, better ergonomics. Right tool, different job. |
| API | Fastify on Node | Same language and types as the agent. Persistent container means one connection pool, which serverless can't give you. |
| Database | Tiger Cloud | Physiology is textbook hypertable data — high-frequency, append-only, time-ordered. Continuous aggregates serve the dashboard without recomputation. A 45-min session at 20 Hz is 54,000 rows. |
| API + frontend hosting | Vultr — Docker + Caddy | Single VM at tryflow.study serves both API and frontend. No Vercel — eliminates deploy complexity and mixed-content `ws://localhost` issues. Caddy handles TLS in three lines. Same region as Tiger Cloud. |
| LLM | Gemini via Backboard | One integration surface, two sponsor tracks. Persistent per-device memory means the coach references prior sessions. |
| Voice | ElevenLabs, server-proxied | Key never reaches the browser. Fixed nudge lines pre-cached as files so the demo doesn't depend on a live call. |

> **Six integrations, two people.** Five sit in Lane B. Cut order if you fall behind: Backboard first (call Gemini directly), then the paced ElevenLabs guide down to fixed audio. Presage, Tiger and Vultr never get cut.

---

## How it fits together

```
START
  /session ──ws──► agent {start_session}
  agent ──POST /v1/sessions──► Fastify ──► Tiger Cloud
  agent begins 4-min baseline; detectors muted

RUNNING
  SmartSpectra ─► metrics 20Hz ─┬─ws─► browser (uPlot)
                                └────► ring buffer
  window poll 2s ─► interval on change ─ws─► browser + buffer
  classifier 1Hz ─► state / alert      ─ws─► browser
                                              │
                    browser ──POST /v1/speak──► Fastify ──► ElevenLabs
                    browser ◄──── audio/mpeg ◄────────────┘
  every 30s: agent ──POST /sessions/:id/batch──► Fastify ──► Tiger
             on failure: spill to JSONL, replay next flush

END
  agent flushes, POSTs /sessions/:id/end
  Fastify computes rollups ─► Backboard ─► Gemini ─► narrative
  /dashboard on Vercel ──GET /v1/sessions──► sees it
```

---

## The frozen contract

Agreed in hour one. The only dependency between the two lanes. Lives in `packages/shared/types.ts`, imported by agent, API, and frontend.

```ts
type State = 'calibrating' | 'deep_work' | 'zoned_out'
           | 'spiral' | 'break' | 'no_signal';

type Category = 'ide' | 'reading' | 'notes' | 'comms'
              | 'browser' | 'distraction' | 'ambient' | 'unknown';

// agent → browser
{ type:'sample', t:number, hr:number, hrv:number, br:number,
  ie:number, amp:number, regularity:number, eda:number,
  blinkRate:number, gazeDisp:number, reading:boolean,
  talking:boolean, face:boolean, conf:number }

{ type:'context', app:string, category:Category, t:number }
{ type:'state', state:State, since:number, reasons:string[] }
{ type:'alert', kind:'zoned_out'|'spiral', t:number }
{ type:'probe', probeId:string }
{ type:'status', camera:boolean, calibrating:boolean,
  conf:number, uploader:'ok'|'retrying'|'offline', sessionId?:string }

// browser → agent
{ type:'start_session', label?:string }
{ type:'end_session' }
{ type:'probe_answer', probeId:string, answer:'focused'|'drifting' }
{ type:'alert_response', kind:string,
  response:'keep_going'|'reset'|'break'|'dismissed' }
{ type:'label_app', app:string, category:Category }
{ type:'request_breathing' }
```

---

## Detection

Classifier logic lives in the agent — sub-second latency, works offline, no per-evaluation cost. Thresholds live in `thresholds.json`, hot-reloaded on file change, so tuning never requires a restart or costs you a session in progress.

```ts
if (blinkRate > base.blink * 1.4
    && gazeDisp < 0.2
    && !reading
    && STUDY.has(category)
    && sustained(90)) fire('zoned_out');
```

Three triggers, three different responses. Most tools have one response for everything, which is why people turn them off. Deep work gets nothing at all — an app that interrupts you while it is working is an app you mute.

| Trigger | State | Response |
|---|---|---|
| Zoned out, 90 s | Drifting, arousal falling | Chime, soft pulse, "still with it?" — keep going / 2-min reset / take a break. |
| Spiral | Wound up, arousal climbing | Offer the calming loop: extended exhale, measured before and after. |
| Manual | They already know | Full guided session, ratio movement shown live. |

The zone-out reset uses an *upregulating* pattern — even in and out — not the extended exhale. Someone drifting off does not need calming down. "Take a break" is a real option, because sometimes the honest read is that they are finished.

---

## Database

```sql
create table devices (
  device_id  uuid primary key,
  label      text,
  created_at timestamptz not null default now());

create table sessions (
  session_id uuid primary key,
  device_id  uuid not null references devices,
  label      text,
  started_at timestamptz not null,
  ended_at   timestamptz,
  baseline   jsonb,   -- from calibration
  stats      jsonb,   -- rollups, written at end
  narrative  text);   -- Gemini output

create table physio (
  time       timestamptz not null,
  session_id uuid not null,
  hr real, hrv real, br real, ie real, amp real, eda real,
  regularity real, blink_rate real, gaze_disp real,
  reading boolean, talking boolean, face boolean, conf real);
select create_hypertable('physio','time');
create index on physio (session_id, time desc);

create table context_intervals (
  id bigserial primary key, session_id uuid not null,
  start_ts timestamptz not null, end_ts timestamptz not null,
  app text, category text not null);
create index on context_intervals (session_id, start_ts);

create table state_intervals (
  id bigserial primary key, session_id uuid not null,
  start_ts timestamptz not null, end_ts timestamptz not null,
  state text not null, reasons text[]);
create index on state_intervals (session_id, start_ts);

create table events (
  id bigserial primary key, session_id uuid not null,
  ts timestamptz not null, kind text not null, response text);

create table probes (
  id bigserial primary key, session_id uuid not null,
  ts timestamptz not null,
  answer text not null,      -- focused | drifting
  predicted text not null);  -- classifier state at that instant

create table app_categories (
  device_id uuid not null, app text not null,
  category text not null, primary key (device_id, app));
```

### Continuous aggregate — the dashboard's workhorse

```sql
create materialized view physio_1m
with (timescaledb.continuous) as
select time_bucket('1 minute', time) as bucket, session_id,
       avg(hr)  filter (where conf > 0.6) as hr,
       avg(hrv) filter (where conf > 0.6) as hrv,
       avg(br)  filter (where conf > 0.6) as br,
       avg(ie)  filter (where conf > 0.6) as ie,
       avg(blink_rate) filter (where conf > 0.6) as blink_rate,
       avg(regularity) filter (where conf > 0.6) as regularity,
       avg(conf) as conf
from physio group by bucket, session_id;
```

### The query that is the product

```sql
select c.category, count(*) as minutes,
       avg(p.hrv) as mean_hrv, avg(p.blink_rate) as mean_blinks
from physio_1m p
join context_intervals c on c.session_id = p.session_id
  and p.bucket >= c.start_ts and p.bucket < c.end_ts
join sessions s on s.session_id = p.session_id
where s.device_id = $1 and p.conf > 0.6
group by c.category order by mean_hrv asc;
```

---

## API

| Endpoint | Purpose |
|---|---|
| `POST /v1/devices` | Register on first agent run |
| `POST /v1/sessions` | Open a session, return id |
| `POST /v1/sessions/:id/batch` | Bulk insert samples, intervals, states, events, probes. Idempotent on a client batch key. |
| `POST /v1/sessions/:id/end` | Close, compute stats, trigger narrative |
| `GET /v1/sessions` | History with summary stats |
| `GET /v1/sessions/:id` | Detail: rollups, intervals, events, narrative |
| `GET /v1/insights` | Focus window, effort per category, settle trend, probe agreement |
| `POST /v1/speak` | ElevenLabs proxy, streamed audio |
| `GET /v1/health` | Uptime ping |

---

## User flows

Two entry points. No landing page, no sign-in. `run.bat` starts the agent before either screen opens.

### Chain A — live session, `localhost:3000/session`

1. **Connect**
   1. Attempts `ws://localhost:8765` on mount
   2. Not running → instructions to double-click `run.bat`, retry every 2 s
   3. Connected → camera preview, confidence meter, optional session label
   4. Start enabled only when confidence > 0.6
2. **Calibrating, 4 min**
   1. Waveforms live immediately — this is the hook, don't hide it
   2. Progress ring, "learning your baseline"
   3. Detectors muted; no alert can fire
3. **Active**
   1. Pulse and breathing, rolling 60 s window
   2. Current state with the signals that voted for it
   3. Elapsed time, app category, confidence
   4. Signal-lost state when face absent — labelled, never interpolated
   5. Manual breathing button, always available
4. **Zone-out alert, after 90 s sustained**
   1. Chime, soft pulse, "still with it?"
   2. Keep going / 2-min reset / take a break
   3. Reset uses the upregulating pattern
   4. Break pauses the session with a resume button
   5. Response written to `events.response` either way
5. **Spiral alert**
   1. Calming loop: measure I:E, pace guide, re-measure
   2. Before and after shown side by side
6. **Thought probe, jittered 8–12 min**
   1. "Right now, were you — focused / drifting"
   2. Dismisses on answer or after 20 s
   3. Classifier state recorded alongside the answer
7. **End**
   1. Local summary: duration, states, alerts
   2. Agent flushes and closes server-side
   3. Link through to the dashboard

### Chain B — dashboard, Vercel

8. **History**
   1. Session cards newest first: date, duration, focus time, state ribbon
   2. Empty state explains the agent and invites a first session
9. **Session detail**
   1. Timeline: state bands over physiology, alert markers, category ribbon
   2. Gemini narrative at the top
   3. Alerts fired and how they were answered
   4. Probe answers overlaid against predicted state
10. **Insights**
    1. Your real focus window — decay curve with the number called out
    2. Effort per app category
    3. Time-to-settle trend
    4. Break quality: restorative versus depleting
    5. Intervention efficacy: I:E before and after
11. **Validation**
    1. Confusion matrix, classifier versus self-report
    2. n, agreement rate, false-alarm rate

---

## Lane A — agent

Owned by whoever is on the Windows machine. Every task is independent of Lane B once the contract is frozen.

- **A0 — API key and SDK smoke test.** Register at the Presage developer portal, install the Node binding, run their example until a real pulse prints to console. Nothing else starts until this does. → *a number on screen*
- **A1 — WebSocket server + mock emitter.** Synthetic samples at 20 Hz matching the contract exactly. Ship to Lane B inside two hours — it is what unblocks them for the whole build. → *ws://localhost:8765 streaming fake data*
- **A2 — Real capture loop.** Camera open, exposure locked, continuous mode, all signals extracted including EDA and expression, confidence read. Swap synthetic for real on the same wire format. → *real pulse on the mock's contract*
- **A3 — Window and idle poller.** Win32 via ffi-napi, 2 s poll, intervals on change, idle threshold, static category map. Titles categorised locally and discarded. → *context messages on the socket*
- **A4 — Baseline calibration.** First 4 minutes: rolling mean and sd for blink rate, HRV, breathing rate, I:E. Detectors muted throughout. → *calibrating state, then a baseline object*
- **A5 — Classifier + hot-reloaded thresholds.** 1 Hz evaluation, states plus no_signal, hysteresis so it doesn't flicker, 90 s sustain before zone-out. Thresholds in JSON, watched for changes. Every transition carries its reasons. → *state and alert messages, tunable live*
- **A6 — Upload buffer.** Ring buffer, 30 s flush, batch POST, exponential backoff, JSONL disk spill on failure with replay on reconnect. Never blocks the sample loop. → *survives 60 s offline with zero loss*
- **A7 — Probe scheduler.** Jittered 8–12 min, suppressed during alerts and calibration. Records the classifier's state at probe time. → *probes fire and persist with predictions*
- **A8 — run.bat, logging, status lines.** Double-click launch, readable console output, rotating log. This is what a judge sees if something goes wrong. → *one double-click to running*

## Lane B — web

Unblocked from minute zero by A1's mock. Five of six sponsor integrations live here.

- **B0 — Monorepo, shared types, both deploys.** Next.js app, Fastify service, `packages/shared/types.ts`, Dockerfile, Vultr VM with Caddy, Vercel project. Get hello-world through Vercel → Vultr → Tiger before any feature. Develop in Docker from hour one so deploying is running what you already run. → *green chain end to end*
- **B1 — Tiger Cloud schema and aggregates.** Tables, hypertable, indexes, continuous aggregate. Seed one fake session and run the category query. → *the product query returns rows*
- **B2 — Ingest endpoints.** Devices, sessions, batch, end. Batch idempotent on a client key so retries can't duplicate. Bulk insert via COPY, not row by row. → *30 s of samples land in < 200 ms*
- **B3 — Live session UI.** WebSocket client, uPlot waveforms on a rolling window, state display with reasons, confidence and signal-lost handling, session controls. Built entirely against the mock. → */session renders fake data beautifully*
- **B4 — Alert and intervention UI.** Zone-out card with three buttons, spiral offer, manual breathing button. Paced breathing animation driven by measured rate. Responses returned over the socket. → *every alert type has a rehearsed visual*
- **B5 — ElevenLabs proxy and playback.** Server-side `/v1/speak`, streamed audio, browser playback. Fixed nudge lines pre-generated to files so the demo survives an API hiccup. → *voice within 1 s of an alert*
- **B6 — Read endpoints and insight maths.** Session list, detail, cross-session insights. Focus window from the decay curve, effort per category, settle trend, break quality, probe agreement. → */v1/insights returns real numbers*
- **B7 — Dashboard UI.** History, session detail with timeline, insights page, confusion matrix. Recharts here. → */dashboard live on Vercel*
- **B8 — Backboard and Gemini narrative.** On session end, send stats plus category intervals through Backboard to Gemini. Per-device memory so the coach references prior sessions. Never send raw window titles. → *a narrative worth reading aloud*
- **B9 — Seed script and demo fallback.** Load the real sessions you both recorded, plus a recorded run that replays through the mock if live sensing fails on stage. → *the demo survives a dead camera*

---

## Synchronisation points

| When | What |
|---|---|
| Hour 1 | Freeze `types.ts`. A1's mock ships to Lane B. |
| Hour 16 | Swap mock for live agent. Budget an hour for shape mismatches. |
| Hour 22 | Both devs record 45-min real sessions. Seed data and probe labels. |
| Hour 30 | Feature freeze. Everything after is rehearsal and fallback. |

Everything else runs parallel. A contract change goes through one message and both sides update `types.ts` — never a silent field addition.

---

## Demo, three minutes

1. **0:00** — "Everyone here has read the same page four times without absorbing it. Nothing on your laptop or your wrist can tell that happened."
2. **0:20** — Sit down. Waveforms come up live off a stock webcam. Let it land.
3. **0:45** — "My breathing is elevated because I'm presenting." App noticed. Voice guides, paced to measured rate. Ratio moves on screen while you keep talking.
4. **1:30** — End the session. Switch tabs. It's at the top of five seeded days, narrative already written. That transition proves the pipeline in one motion.
5. **1:50** — Focus window. Effort per category. The zone-out timeline.
6. **2:15** — Confusion matrix. "We didn't guess. We collected labels."
7. **2:40** — Privacy architecture, ten seconds. Close.

---

## Risks, ranked

1. **Venue lighting kills sensing.** Top risk now that Windows is confirmed. Test in the actual room early, bring a lamp, keep B9's recorded fallback rehearsed.
2. **Six integrations, two people.** Cut order is fixed above. Decide by hour 24, not hour 34.
3. **Six hours of recording competes with build time.** Schedule it deliberately — one dev records while the other builds, then swap.
4. **Over-alerting.** If it fires every three minutes in testing, raise the sustain window. Quiet beats twitchy.
5. **Integration at hour 16 eats six hours.** Mitigated only by taking the contract seriously in hour one.
