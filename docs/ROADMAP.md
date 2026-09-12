# Flow MVP — Roadmap

**Vision:** Full working product: live physiological sensing from webcam, zone-out and spiral detection, voice intervention with breathing guide, Gemini-powered dashboard with cross-session insights, deployed on Vultr at tryflow.study, demo-ready for HackRice 16 live judging.

## Success Criteria

- Live waveforms render within 20s of agent start from external USB webcam
- Zone-out detection fires after 90s sustained signal with corrected classifier (blink-rate-change + head stillness + HRV/EDA drop + app context + not-talking)
- Spiral detection fires when arousal climbing (elevated HR, reduced HRV, increased EDA)
- Breathing guide animates at measured breathing rate with live I:E display
- Voice cues play via ElevenLabs with pre-cached fallback, mute toggle works
- Session data persists to Tiger Cloud via 30s batch inserts
- Dashboard loads session history and Gemini narrative from API at tryflow.study
- Cross-session insights render as dedicated per-card UI with Gemini analysis
- Demo mode replays pre-recorded session via UI toggle button
- Seed data (5-7 sessions) populates dashboard for demo
- 2-minute scripted demo rehearsed end-to-end

## Slices

- [x] **S01: Foundation and Infrastructure** — monorepo, Tiger Cloud schema, Vultr VM, Docker/Caddy, `@flow/shared` types
- [x] **S02: Agent Core and Sensing** — WS server, mock emitter, SmartSpectra SDK adapter, session lifecycle
- [x] **S03: Live Session UI** — waveforms, session controls, state display
- [x] **S04: Classifier, Context, and Probes** `risk:high` — see below, in progress
- [x] **S05: Persistence and API Foundation** — Tiger Cloud writes, offline buffer, base API routes
- [ ] **S06: Intervention and Voice** `risk:medium` `depends:[S03,S04]`
  > After this: Zone-out alert shows card with three buttons, breathing guide animates at measured breathing rate with live I:E before and after, voice cue plays within 1s of alert, mute toggle silences voice but keeps visual, pre-cached fallback works when ElevenLabs is down
- [x] **S07: Dashboard and Insights** — session history, Gemini narrative, cross-session insight cards, confusion matrix
- [ ] **S08: Demo Mode, Seed Data, and Polish** `risk:low` `depends:[S06,S07]`
  > After this: Demo button in UI replays pre-recorded session convincingly, seed script populates 5-7 realistic sessions on dashboard, run.bat launches agent with one double-click, scripted 2-minute demo rehearsed successfully

### S04: Classifier, Context, and Probes (current)

**Goal:** Zone-out and spiral detection with app context tracking, thought probes, baseline calibration, and hot-reloadable thresholds. All classifier logic runs in the agent at 1Hz.

**Must-haves:**
- Zone-out alert fires after 90s sustained signal with corrected classifier
- Spiral alert fires on arousal climb (elevated HR, reduced HRV, increased EDA)
- App context messages show categorized foreground window
- Thought probes appear at jittered 8-12 min intervals
- Thresholds hot-reload from `thresholds.json` without restart
- Baseline calibration runs for 4 minutes computing rolling stats

**Tasks:**
- [x] T01: Baseline calibration and ring buffer — `apps/agent/src/baseline.ts`, `ring-buffer.ts`
- [x] T02: Classifier with zone-out and spiral detection — `apps/agent/src/classifier.ts`, `thresholds.ts`, `thresholds.json`
- [x] T03: Window tracking and app context — `apps/agent/src/window-tracker.ts`, `app-categories.ts`
- [x] T04: Thought probe scheduler — `apps/agent/src/probe-scheduler.ts`
- [x] T05: Wire classifier pipeline into agent — `apps/agent/src/index.ts`, `pipeline.ts`

All five files exist and the monorepo builds clean (`pnpm build`, `tsc --noEmit` on `@flow/agent`) — implementation looks complete, just needed committing.

## Boundary Map

### S01 → S02
Produces: Tiger Cloud connection string in env vars; `@flow/shared` package with corrected `types.ts`; Docker base image and Caddy config; monorepo build pipeline.

### S01 → S05
Produces: Tiger Cloud schema (hypertable, indexes, continuous aggregates, compression policy); Fastify project scaffold with Tiger Cloud connection pool; Vultr VM with Caddy reverse proxy.

### S02 → S03
Produces: WebSocket server on `ws://localhost:8765` streaming corrected contract messages; mock emitter at 20Hz; all WS message type definitions in `@flow/shared`.

### S02 → S04
Produces: SmartSpectra SDK integration producing decoded metrics (Cardio, Breathing, Face, Eda); raw metric event stream for classifier consumption; blink detection event stream (binary `DetectionStatus`); landmark coordinates (478 points per frame).

### S03 → S06
Produces: Session UI shell with component slots for alert cards and breathing guide; WebSocket message routing infrastructure; uPlot waveform components that can overlay intervention markers.

### S04 → S06
Produces: Alert messages (`zone_out`, `spiral`) on WS with reasons array; state messages with current classifier state; breathing rate and inhale/exhale ratio in sample messages for guide animation.

### S05 → S07
Produces: `GET /v1/sessions` (list with summary stats); `GET /v1/sessions/:id` (detail with rollups, intervals, events, narrative); `GET /v1/insights` (focus window, effort per category, settle trend, break quality, probe agreement); `POST /v1/sessions/:id/end` triggers Gemini narrative generation.

### S06, S07 → S08
Consumes: complete live session flow (S06) for demo mode replay target; complete dashboard (S07) for seed data display target.
