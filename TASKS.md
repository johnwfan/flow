# S01: Foundation and Infrastructure — Task Breakdown

**Milestone:** Flow MVP (HackRice 16, demo Sunday 9/13)
**Slice goal:** Monorepo builds, shared types work, Vultr VM live at tryflow.study, Tiger Cloud schema deployed.

## Parallel Tracks

```
Track A (Codebase):  T01 ──→ T02
Track B (Infra):     T03          ← independent, start immediately
Track C (Database):  T04          ← independent, start immediately
```

Two-person split: **Dev 1** takes T01→T02, **Dev 2** takes T03+T04. Both converge at slice verification.

---

## T01: Monorepo scaffold + shared types (25 min)

**Why:** Every downstream slice imports `@flow/shared`. Must exist first.

**Create these files:**

| File | Purpose |
|------|---------|
| `package.json` | Root workspace (name: flow, private: true) |
| `pnpm-workspace.yaml` | Lists `packages/*` and `apps/*` |
| `tsconfig.json` | Root strict config with `@flow/shared` path alias |
| `turbo.json` | Build pipeline: shared first, apps parallel |
| `packages/shared/package.json` | `@flow/shared` — main/types → dist |
| `packages/shared/tsconfig.json` | Extends root |
| `packages/shared/src/types.ts` | All types (see contract below) |
| `packages/shared/src/index.ts` | Re-exports everything from types |

### Corrected SmartSpectra contract (`types.ts`)

```ts
// Enums
enum State { focused, zoned_out, spiraling, no_signal, warmup }
enum Category { study, social, entertainment, productivity, communication, system, unknown }

// Messages (all have `kind` discriminator)
SampleMessage     // ts, pulse_bpm?, breathing_rpm?, hrv_ms?, eda_us?, conf (0-1), blink?, talking?, landmarks?, expressions?
StateMessage      // state, reasons[], confidence, ts
AlertMessage      // type: zone_out|spiral, reasons[], ts, duration_s
AppContextMessage // app_title, category, ts
ThoughtProbeMessage   // ts, classifier_state, user_response?
BreathingGuideMessage // phase: inhale|exhale|hold, duration_ms, measured_rpm, ie_ratio
SessionControlMessage // action: start|end|pause|resume, session_id, ts

type WsMessage = SampleMessage | StateMessage | AlertMessage | ... // union with `kind` discriminator
```

Key corrections from PRD: `gazeDisp`, `reading`, `regularity` don't exist in SDK. `blinkRate` is binary `DetectionStatus`, not a rate. `conf` is 0-100 from SDK, normalize to 0-1 at agent. All physio fields nullable (warmup periods).

**Verify:** `pnpm build --filter @flow/shared`

---

## T02: App scaffolds + build (30 min) — depends on T01

**Why:** S02 needs `apps/agent`, S05 needs `apps/api`, S03 needs `apps/web`. All must import `@flow/shared`.

### apps/agent
- `package.json` — deps: `@flow/shared`, `typescript`, `ts-node`
- `tsconfig.json` — Node target
- `src/index.ts` — imports `State` from `@flow/shared`, logs "agent ready"

### apps/api
- `package.json` — deps: `@flow/shared`, `fastify`, `@fastify/cors`, `pg`
- `tsconfig.json`
- `src/index.ts` — Fastify on port 3001, `GET /health` → `{ status: "ok" }`

### apps/web
- `package.json` — deps: `@flow/shared`, `next`, `react`, `react-dom`
- `tsconfig.json` — JSX support
- `next.config.js` — `transpilePackages: ["@flow/shared"]`
- `src/app/layout.tsx` + `src/app/page.tsx` — hello-world Next.js

**Verify:** `pnpm build` (all 4 packages succeed)

**Splittable:** agent, api, web scaffolds are independent of each other within this task.

---

## T03: Vultr VM + Docker + Caddy (25 min) — no dependencies

**Why:** `tryflow.study` must serve the app. Vultr is a sponsor track.

| File | Purpose |
|------|---------|
| `infra/Dockerfile` | Multi-stage: build (node:20-alpine, pnpm) → runtime (prod deps only). Ports 3000+3001 |
| `infra/Caddyfile` | `tryflow.study` → :3000 (web), `/v1/*` → :3001 (api), `/ws/*` → :8765 (future WS). Auto HTTPS |
| `infra/docker-compose.yml` | app + caddy services |
| `infra/deploy.sh` | SSH to Vultr, git pull, docker compose up --build -d |
| `infra/hello-world.js` | Temp static server for initial deploy verification |
| `.env.example` | Placeholders: TIGER_CLOUD_URL, GEMINI_API_KEY, ELEVENLABS_API_KEY, VULTR_SSH_HOST |

**Verify:** Docker builds locally, Caddyfile valid.

---

## T04: Tiger Cloud schema (20 min) — no dependencies

**Why:** S05 batch-inserts into Tiger Cloud. Schema must exist. Sponsor track — advanced features show depth.

| File | What it creates |
|------|----------------|
| `infra/migrations/001_init.sql` | `samples` hypertable (session_id, device_id, ts, pulse_bpm?, breathing_rpm?, hrv_ms?, eda_us?, conf?, blink?, talking?, state, category?, app_title?). Indexes on session+ts, device+ts |
| `infra/migrations/002_aggregates.sql` | Continuous aggregate views: `samples_1min` and `samples_5min` (time_bucket, avgs, count, last state). Refresh policies |
| `infra/migrations/003_compression.sql` | Compression on samples (segmentby session_id, orderby ts DESC). Compress chunks > 1 day |
| `infra/migrations/004_sessions.sql` | `sessions` table (id uuid, device_id, started_at, ended_at?, narrative?, duration_s?). `events` table (session_id, ts, kind, payload jsonb). Indexes |
| `infra/migrate.sh` | Connects to TIGER_CLOUD_URL, runs migrations in order |
| `infra/migrations/verify.sql` | Queries to confirm hypertable, aggregates, compression exist |

**Verify:** All SQL files exist and are syntactically valid.

---

## Slice Success Criteria

- [x] pnpm workspaces resolve `@flow/shared` import from all three apps
- [x] `pnpm build` succeeds across monorepo via turborepo
- [x] Vultr VM serves hello-world at tryflow.study via Caddy
- [x] Tiger Cloud hypertable `samples` exists with correct columns, continuous aggregates, compression
- [x] Shared `types.ts` exports State, Category, and all WS message types

## What This Unblocks

- **S02** (Agent + Camera): needs `@flow/shared` types
- **S05** (API + Tiger Cloud): needs schema + Fastify scaffold + Vultr VM
- **S03** (UI): needs `apps/web` scaffold
