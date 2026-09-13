# Flow — Lane B Integration Guide

**For:** Lane A (the agent/camera/classifier developer, or their AI)
**Branch:** `lane-b` (2 commits ahead of `main`, `main` unchanged since branching — safe to merge)
**Status:** Built, verified end-to-end against the real Tiger Cloud DB. Not yet deployed to the Vultr droplet (which is still running an older, incompatible build) and not yet merged to `main`.

This doc describes what Lane B (infra, DB, API, dashboard) actually implements right now, not just what was planned — read this instead of (or alongside) `LANE-B-HANDOFF.md`, which is the original task assignment and is stale in a few places (see "Deviations from the original handoff" below).

---

## 1. What's built

| Piece | Location | State |
|---|---|---|
| Vultr/Docker/Caddy | `infra/` | Built, `docker build` verified, `caddy validate` passes. Not yet redeployed. |
| Tiger Cloud schema | `infra/migrations/001-005.sql` | Applied and live on the real Tiger Cloud instance (hypertable, compression, continuous aggregates, sessions/events/batch_keys). |
| Fastify API | `apps/api/src/` | All 8 endpoints implemented, smoke-tested against the real DB (full session lifecycle incl. idempotent dedup). |
| Next.js dashboard | `apps/web/src/` | `/dashboard`, `/dashboard/[id]`, `/insights`, `/validation` all render. |

`apps/agent/` was not touched.

---

## 2. What you (Lane A) call

Three endpoints are your integration surface — the agent calls these directly over HTTP. Base URL in dev: `http://localhost:3001`.

### `POST /v1/sessions` — start a session
```json
// Request
{ "deviceId": "string" }

// Response 200
{ "sessionId": "uuid" }
```

### `POST /v1/sessions/:id/batch` — send a ~30s batch
```json
// Request
{
  "batchKey": "uuid",              // idempotency key — same key = safe to retry
  "samples": [ /* SampleMessage[], from @flow/shared */ ],
  "events": [
    { "ts": 1699999999000, "kind": "state", "payload": { "state": "focused" } },
    { "ts": 1699999999000, "kind": "alert", "payload": { "type": "zone_out", "reasons": [...], "duration_s": 45 } },
    { "ts": 1699999999000, "kind": "session_control", "payload": { "action": "pause" } }
  ],
  "contexts": [ /* AppContextMessage[], from @flow/shared */ ],
  "probes": [ /* ThoughtProbeMessage[], from @flow/shared */ ]
}

// Response 200
{ "deduped": false }   // true if this batchKey was already applied — safe, no error, retry freely
```

**Important — `events` is generic, and the API's downstream behavior depends on `kind`:**
- `kind: "state"` — drives forward-fill of `state` onto every `samples` row up to the next state change (and `focusTimeS`/state ribbon on the dashboard). **Without these, every sample is stamped with whatever state was last known — send one per state transition, not one per sample.**
- `kind: "alert"` — read by `/v1/insights`' intervention-efficacy calc (breathing rate before/after the alert timestamp). Payload shape isn't validated server-side; only `ts` and `kind='alert'` matter today.
- `kind: "session_control"` with `payload.action: "pause"` / `"resume"` — drives the break-quality insight (a pause→resume pair is "restorative" if the session returns to `Focused` within 3 minutes of resuming). Other actions (`start`/`end`) aren't currently read from here — session start/end go through the dedicated endpoints below, not through this array.
- `contexts` and `probes` are NOT generic events — they're their own arrays using the exact `@flow/shared` shapes (`AppContextMessage`, `ThoughtProbeMessage`). Context changes forward-fill `category`/`app_title` onto samples the same way state does.

Up to 600 samples/batch (30s × 20Hz) is what the API is sized for; there's no hard cap enforced, just what the batch insert was designed/tested against.

### `POST /v1/sessions/:id/end` — close a session
```json
// Response 200
{
  "sessionId": "uuid",
  "durationS": 1234,
  "narrative": "string"   // Gemini-generated, or a fixed fallback string if GEMINI_API_KEY is unset/fails
}
```
Computes `duration_s` from `now() - started_at`, then generates+stores a narrative synchronously (8s timeout, falls back silently — this call can take a few seconds, don't assume it's instant).

---

## 3. Other endpoints (dashboard-facing, documented for completeness)

### `GET /v1/sessions?deviceId=` → `{ sessions: SessionSummary[] }`
### `GET /v1/sessions/:id` → `{ summary: SessionSummary, timeline: TimelineBucket[], alerts, contexts, probes }`
(`alerts`/`contexts`/`probes` here are the raw stored event rows: `{ ts, kind, payload }`.)

```ts
interface SessionSummary {
  id: string;
  deviceId: string;
  startedAt: string;       // ISO
  endedAt: string | null;
  durationS: number | null;
  narrative: string | null;
  focusTimeS: number;
  stateRibbon: { state: string; startedAt: string; endedAt: string; durationS: number }[];
}

interface TimelineBucket {
  bucket: string;           // ISO, 1-min buckets if session ≤1hr else 5-min
  avgPulseBpm: number | null;
  avgBreathingRpm: number | null;
  avgHrvMs: number | null;
  avgEdaUs: number | null;
  state: string;
}
```

**Gotcha:** the timeline/summary read from the `samples_1min`/`samples_5min` continuous aggregates, which refresh on a schedule (~1 min lag), not from raw `samples`. A session ended seconds ago may show an empty timeline briefly — this is expected, not a bug.

### `GET /v1/insights?deviceId=`
```json
{
  "focusWindow": { "medianMinutes": number | null, "decayCurve": [{ "minute": 0, "pctStillFocused": 100 }] },
  "effortByCategory": [{ "category": "study", "minutes": 42 }],
  "settleTrend": [{ "sessionId": "uuid", "date": "iso", "settleSeconds": number | null }],
  "breakQuality": { "restorative": 3, "depleting": 1 },
  "interventionEfficacy": [{ "ts": "iso", "breathingRpmBefore": number | null, "breathingRpmAfter": number | null }],
  "validation": {
    "confusionMatrix": { "focused": { "focused": 5, "zoned_out": 1 } },
    "n": 6,
    "agreementRate": 0.83,
    "falseAlarmRate": 0
  }
}
```
`effortByCategory`: unknown app titles get batch-classified via Gemini (cached in-process by title) — falls back to `"unknown"` if `GEMINI_API_KEY` is unset.

### `POST /v1/speak` → streams `audio/mpeg`
`{ "lineId": "cached-line-name" }` serves a pre-cached file from `apps/api/public/audio/<lineId>.mp3` (none currently populated). `{ "text": "..." }` proxies live to ElevenLabs. Throws 502 without `ELEVENLABS_API_KEY`.

### `GET /v1/health` (and `/health`) → `{ "status": "ok", "defaultState": "warmup" }`

**Note:** there is no route at bare `GET /` on the API — that 404s by design. All real routes are under `/v1/*` (plus the unprefixed `/health` alias).

---

## 4. Env vars

| Var | Status | Effect if missing |
|---|---|---|
| `TIGER_CLOUD_URL` | ✅ set, working | API won't start at all |
| `VULTR_SSH_HOST` | ✅ set | only needed for deploy, not local dev |
| `GEMINI_API_KEY` | ❌ **not set** | narratives fall back to a fixed string; app-category classification falls back to `"unknown"` for uncategorized titles |
| `ELEVENLABS_API_KEY` | ❌ **not set** | `/v1/speak` with `text` returns 502 |

`.env` lives at the worktree root (`/Users/johnfan/flow-lane-b/.env`), loaded via `dotenv` in-code by both `apps/api` and `apps/web` — not via shell export or `dotenv-cli`.

---

## 5. Deviations from the original `LANE-B-HANDOFF.md`

- Env var is `TIGER_CLOUD_URL`, not `DATABASE_URL` (an earlier parallel session used the latter; standardized on the former).
- `docker-compose.yml` uses bridge networking (`app`/`caddy` services via `expose`, Caddy reverse-proxying by service name) instead of `network_mode: host`.
- Dockerfile uses `turbo prune --docker` for both `@flow/api` and `@flow/web` in one image, rather than manually listing package paths.
- `infra/Caddyfile`'s `/ws/*` route to `app:8765` is a **placeholder** — there's no WebSocket service in `docker-compose.yml` yet, since the agent's WS server runs client-side per the PRD. If Lane A's WS server needs to be reachable through Caddy in production, that's an open item to coordinate on.
- `infra/migrate.sh` has no migration-tracking table — it just runs all 5 files every time. Fine for a one-shot apply (already done); re-running it against the live DB will error on `CREATE TABLE samples` since it already exists. Don't re-run it without adding `IF NOT EXISTS` guards or dropping tables first.

---

## 6. Running it locally

```bash
cd /Users/johnfan/flow-lane-b
pnpm install
pnpm --filter @flow/api dev    # :3001, needs TIGER_CLOUD_URL in .env
pnpm --filter @flow/web dev    # :3000
```

`GET http://localhost:3001/v1/health` confirms the API is up.

---

## 7. Not yet done

- **Not deployed** — the Vultr droplet (`tryflow.study`, `155.138.204.226`) is still running an older, schema-incompatible build from a different session. Redeploying will overwrite it; held pending explicit go-ahead since it's a production-affecting action.
- **Not merged to `main`** — `lane-b` is ready (clean build, clean git diff against `apps/agent/`, main hasn't moved), but the merge itself hasn't happened.
- `GEMINI_API_KEY` / `ELEVENLABS_API_KEY` not yet added to `.env` — narrative and speech features are code-complete but functionally inert until then.
- No project-wide ESLint config — `pnpm lint` currently only builds `@flow/shared`, doesn't lint anything.
