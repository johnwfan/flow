# Lane B — Infrastructure, API, and Dashboard

**For:** The other developer (or their Claude instance)
**Updated:** 2026-09-12
**Branch:** `milestone/M001-kh8z9o`

---

## Your Scope

You own everything **except** `apps/agent/`. Do not touch that directory — the other dev (Lane A) builds the agent, camera, classifier, and interventions there.

### Task Order

| Priority | Task | Directory | Est |
|----------|------|-----------|-----|
| 1 | **T03** — Vultr VM + Docker + Caddy | `infra/` | 25m |
| 2 | **T04** — Tiger Cloud schema migrations | `infra/migrations/` | 20m |
| 3 | **S05** — Fastify API endpoints + Tiger Cloud persistence | `apps/api/src/` | medium |
| 4 | **S07** — Dashboard + insights UI | `apps/web/src/` | medium |

T03 and T04 are independent — do them in parallel or either order.
S05 depends on T04 (schema must exist). S07 depends on S05 (API must serve data).

---

## What's Already Done (T01 + T02 ✅)

- pnpm monorepo with Turborepo — `pnpm build` passes all 4 packages
- `packages/shared/` — `@flow/shared` exports all types (see frozen contract below)
- `apps/agent/` — placeholder, Lane A's territory
- `apps/api/` — Fastify scaffold, `GET /health` on port 3001
- `apps/web/` — Next.js 15 hello-world on port 3000
- All apps import `@flow/shared` successfully

### Key monorepo conventions
- ESM everywhere (`"type": "module"` in all package.json files)
- TypeScript with Node16 module/moduleResolution
- `.js` extensions in TypeScript imports (e.g., `import { State } from "@flow/shared"` works via workspace resolution)
- Web app: tsconfig overrides root `paths` to `{}` and omits `rootDir`/`outDir` — Next.js uses `transpilePackages: ["@flow/shared"]` instead of tsconfig path aliases

---

## The Frozen Contract — `packages/shared/src/types.ts`

**DO NOT MODIFY THIS FILE.** Both lanes build to it. Any change requires both devs to agree.

```ts
// Enums
export enum State { Focused, ZonedOut, Spiraling, NoSignal, Warmup }
export enum Category { Study, Social, Entertainment, Productivity, Communication, System, Unknown }
export enum DetectionStatus { Detected, NotDetected, Unknown }

// All messages use `kind` as discriminator
SampleMessage     { kind: "sample", ts, pulse_bpm?, breathing_rpm?, hrv_ms?, eda_us?, conf?(0-1), blink?, talking?, landmarks?, expressions? }
StateMessage      { kind: "state", state, reasons[], confidence, ts }
AlertMessage      { kind: "alert", type: "zone_out"|"spiral", reasons[], ts, duration_s }
AppContextMessage { kind: "app_context", app_title, category, ts }
ThoughtProbeMessage   { kind: "thought_probe", ts, classifier_state, user_response? }
BreathingGuideMessage { kind: "breathing_guide", phase, duration_ms, measured_rpm, ie_ratio }
SessionControlMessage { kind: "session_control", action, session_id, ts }

type WsMessage = SampleMessage | StateMessage | AlertMessage | ...
```

Full file at `packages/shared/src/types.ts`.

---

## Port Map (hardcoded constants)

| Service | Port | Owner |
|---------|------|-------|
| Next.js Web | `3000` | You |
| Fastify API | `3001` | You |
| Agent WebSocket | `8765` | Lane A |

---

## T03: Vultr VM + Docker + Caddy

Create these files:

| File | Purpose |
|------|---------|
| `infra/Dockerfile` | Multi-stage: Stage 1 (node:20-alpine, pnpm install, pnpm build for api+web) → Stage 2 (node:20-alpine, prod deps only, ports 3000+3001, CMD runs both via shell script) |
| `infra/Caddyfile` | `tryflow.study` → `:3000` (web), `/v1/*` → `:3001` (api), `/ws/*` → `:8765` (websocket, future). Auto HTTPS. |
| `infra/docker-compose.yml` | `app` service (builds Dockerfile, network_mode: host), `caddy` service (caddy:2-alpine, mounts Caddyfile, ports 80/443) |
| `infra/deploy.sh` | SSH to `$VULTR_SSH_HOST`, git pull, `docker compose up --build -d` |
| `infra/hello-world.js` | Temp Node HTTP server returning "Flow is live" for initial deploy verification |
| `.env.example` | Placeholders: `TIGER_CLOUD_URL`, `GEMINI_API_KEY`, `ELEVENLABS_API_KEY`, `VULTR_SSH_HOST` |

**Verify:** `node infra/hello-world.js` serves a response. Docker builds locally. Caddyfile is valid syntax.

---

## T04: Tiger Cloud Schema Migrations

Create these files under `infra/migrations/`:

### `001_init.sql`
```sql
CREATE TABLE samples (
  id BIGSERIAL,
  session_id UUID NOT NULL,
  device_id TEXT NOT NULL,
  ts TIMESTAMPTZ NOT NULL,
  pulse_bpm REAL,
  breathing_rpm REAL,
  hrv_ms REAL,
  eda_us REAL,
  conf REAL,
  blink TEXT,
  talking TEXT,
  state TEXT NOT NULL,
  category TEXT,
  app_title TEXT
);
SELECT create_hypertable('samples', 'ts');
CREATE INDEX idx_samples_session ON samples (session_id, ts DESC);
CREATE INDEX idx_samples_device ON samples (device_id, ts DESC);
```

### `002_aggregates.sql`
- `samples_1min` materialized view: `time_bucket('1 minute', ts)`, session_id, avg pulse/breathing/hrv/eda, count, `last(state, ts)`
- `samples_5min` materialized view: same with 5-minute buckets
- Continuous aggregate refresh policies (1 min refresh for 1min view, 5 min for 5min view)

### `003_compression.sql`
- Compression on samples: segmentby `session_id`, orderby `ts DESC`
- Compression policy: chunks older than 1 day

### `004_sessions.sql`
```sql
CREATE TABLE sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  device_id TEXT NOT NULL,
  started_at TIMESTAMPTZ NOT NULL,
  ended_at TIMESTAMPTZ,
  narrative TEXT,
  duration_s INTEGER
);

CREATE TABLE events (
  id BIGSERIAL PRIMARY KEY,
  session_id UUID NOT NULL REFERENCES sessions(id),
  ts TIMESTAMPTZ NOT NULL,
  kind TEXT NOT NULL,
  payload JSONB
);
CREATE INDEX idx_events_session ON events (session_id, ts DESC);
```

### `migrate.sh`
Connects to `$TIGER_CLOUD_URL`, runs all migration files in order.

### `verify.sql`
Queries to confirm hypertable exists, aggregates exist, compression policy active.

**Verify:** All files exist and are syntactically valid SQL.

---

## S05: API Endpoints + Tiger Cloud Persistence

Extend `apps/api/src/index.ts` with these endpoints:

| Endpoint | Method | Purpose |
|----------|--------|---------|
| `/v1/sessions` | POST | Create session, return `{ sessionId }` |
| `/v1/sessions` | GET | List sessions with summary stats |
| `/v1/sessions/:id` | GET | Session detail: rollups, intervals, events, narrative |
| `/v1/sessions/:id/batch` | POST | Bulk insert samples+events. **Idempotent on `batchKey`** |
| `/v1/sessions/:id/end` | POST | Close session, compute rollups, trigger Gemini narrative |
| `/v1/insights` | GET | Focus window, effort/category, settle trend, break quality, probe agreement |
| `/v1/speak` | POST | ElevenLabs proxy, streamed audio response |
| `/v1/health` | GET | Already exists ✅ |

### Batch payload shape (agent → API)
```ts
POST /v1/sessions/:id/batch
{
  batchKey: string,           // UUID — idempotency key, reject duplicates
  samples: SampleMessage[],   // up to 600 (30s × 20Hz)
  events: { ts: number, kind: string, payload: any }[],
  contexts: AppContextMessage[],
  probes: ThoughtProbeMessage[]
}
```

### Key implementation notes
- Use `pg` connection pool to Tiger Cloud (`TIGER_CLOUD_URL` env var)
- Batch insert via multi-row INSERT or COPY for performance (target < 200ms for 600 samples)
- `batchKey` dedup: store seen batch keys per session, reject duplicates with 200 OK (not error)
- Offline buffer replay: the agent retries with the same batchKey, so idempotency is critical
- On session end: compute stats from continuous aggregates, call Gemini for narrative
- ElevenLabs proxy: server-side call so API key never reaches browser. Stream audio back.

### Gemini integration
- **Session narrative**: On `POST /v1/sessions/:id/end`, send session stats + category intervals to Gemini, store narrative in sessions table
- **Cross-session insights**: `GET /v1/insights` runs analysis across device's sessions
- **App categorization**: few-shot prompt with exact Category enum, cached per app_title. Batch unseen titles.
- Use `GEMINI_API_KEY` env var, direct API (no Backboard)

### ElevenLabs integration
- `POST /v1/speak` proxies to ElevenLabs TTS API
- Pre-cache fixed nudge lines as audio files in `public/audio/` for fallback
- Use `ELEVENLABS_API_KEY` env var

---

## S07: Dashboard + Insights UI

Build in `apps/web/src/`. Two main routes:

### `/dashboard` — Session History
- Session cards, newest first: date, duration, focus time, state ribbon
- Empty state: explains the agent, invites first session
- Click card → session detail

### `/dashboard/[id]` — Session Detail
- Gemini narrative at top
- Timeline: state bands over physiology, alert markers, category ribbon
- Use **Recharts** for static charts (not uPlot — that's for the live 20Hz session page)
- Alerts fired and responses
- Probe answers overlaid against predicted state

### `/insights` — Cross-Session Insights
Each insight is a dedicated card with Gemini analysis:
- **Focus window** — decay curve with the number called out
- **Effort per app category** — bar/pie chart
- **Time-to-settle trend** — line chart across sessions
- **Break quality** — restorative vs depleting
- **Intervention efficacy** — I:E ratio before and after

### `/validation` — Confusion Matrix
- Classifier vs self-report agreement
- n, agreement rate, false-alarm rate

### Design language
- **Notion-esque**: minimal, expressive typography, clean whitespace, warm neutral palette
- NOT a clinical health dashboard or dark developer tool
- Reference: Notion's clean, readable data presentation style

### Data fetching
All data comes from the S05 API endpoints:
- `GET /v1/sessions` → history page
- `GET /v1/sessions/:id` → detail page
- `GET /v1/insights` → insights page

---

## Integration Points Between Lanes

### What Lane A provides (you consume):
- WebSocket server at `ws://localhost:8765` — the live session page connects here
- Mock emitter that streams synthetic `SampleMessage` at 20Hz for UI development
- All WS message types defined in `@flow/shared`

### What you provide (Lane A consumes):
- `POST /v1/sessions` — agent calls on session start
- `POST /v1/sessions/:id/batch` — agent sends 30s sample batches
- `POST /v1/sessions/:id/end` — agent calls on session end
- Vultr VM with Caddy reverse proxy serving the deployed app

### Live session page (`/session`) — shared ownership
- Lane A builds the WS server + agent
- You build the UI that connects to `ws://localhost:8765`:
  - uPlot waveforms (20Hz, 60s rolling window) — **must use uPlot, not Recharts** (performance)
  - State display with reasons
  - Confidence meter
  - Session controls (start/end/pause/resume)
  - Signal-lost handling
  - Alert cards (zone-out, spiral)
  - Breathing guide animation
  - Thought probe modal

---

## Environment Variables

Create `.env` from `.env.example`:
```
TIGER_CLOUD_URL=postgres://...    # Tiger Cloud connection string
GEMINI_API_KEY=...                # Google Gemini API key
ELEVENLABS_API_KEY=...            # ElevenLabs TTS API key
VULTR_SSH_HOST=...                # Vultr VM SSH host for deploy.sh
```

---

## Commands

```bash
pnpm install          # install all deps
pnpm build            # build all packages
pnpm dev              # run all in dev mode (turbo)
pnpm dev --filter @flow/api    # just the API
pnpm dev --filter @flow/web    # just the web app
```
