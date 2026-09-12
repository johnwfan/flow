# Requirements

The explicit capability and coverage contract for Flow MVP (HackRice 16).

## Active

### R001 — Real-time physio capture via SmartSpectra (pulse, breathing, HRV, EDA, face metrics at 20Hz)
- Class: core-capability
- Why it matters: Foundation of the entire product — without live physiological data, nothing else works
- Owning slice: S02 ✅ done

### R002 — Zone-out detection using corrected classifier (blink-rate-change + head stillness + HRV/EDA arousal drop + app context + not-talking)
- Class: core-capability
- Why it matters: The core product differentiator — detecting eyes-on-page-brain-gone state that no other tool measures
- Owning slice: S04 (in progress)

### R003 — Spiral detection (wound up, arousal climbing — elevated HR, reduced HRV, increased EDA)
- Class: core-capability
- Why it matters: Second failure state the product catches — complements zone-out with the opposite arousal direction
- Owning slice: S04 (in progress)

### R004 — Voice intervention with ElevenLabs + paced breathing guide animated at measured breathing rate with live I:E display
- Class: core-capability
- Why it matters: The intervention is the product — detection without action is a monitoring dashboard, not a tool
- Owning slice: S06

### R005 — Live session UI with uPlot waveforms (20Hz 60s rolling window), session controls, state display with reasons
- Class: primary-user-loop
- Why it matters: The hook — seeing your own pulse live from a webcam is what makes people stop and watch
- Owning slice: S03 ✅ done

### R006 — Session persistence to Tiger Cloud via 30s batch inserts with idempotent batch keys
- Class: integration
- Why it matters: Sponsor track requirement and enables dashboard/insights to work independently from any browser
- Owning slice: S05 ✅ done

### R007 — Dashboard with session history, session detail timeline, and Gemini narrative
- Class: primary-user-loop
- Why it matters: Closes the loop — detection and intervention are meaningless without a way to see patterns across sessions
- Owning slice: S07 ✅ done

### R008 — Gemini session narrative generated on session end from stats and context intervals
- Class: differentiator
- Why it matters: Turns raw data into a coach-style summary — the product insight, not just numbers
- Owning slice: S07 ✅ done

### R009 — Cross-session insights with dedicated per-card UI (focus window, app effort, settle trend, break quality, intervention efficacy) each with Gemini one-liner
- Class: differentiator
- Why it matters: Shows patterns across sessions — the long-term value proposition beyond single-session detection
- Owning slice: S07 ✅ done

### R010 — Gemini app categorization with few-shot prompt and cache-first pattern
- Class: differentiator
- Why it matters: Eliminates manual app labeling while showing AI integration; cached for consistency
- Owning slice: S04 (in progress)

### R011 — One-click launch via run.bat with readable console output and rotating log
- Class: launchability
- Why it matters: Demo reliability — judges see a clean start, not a terminal full of npm commands
- Owning slice: S08

### R012 — Demo mode with UI toggle button — replays pre-recorded JSONL capture through same WebSocket contract
- Class: launchability
- Why it matters: Safety net for live demo — if camera or lighting fails, demo continues with real-looking data
- Owning slice: S08

### R013 — Seed data script generating 5-7 physiologically plausible sessions for dashboard demo
- Class: launchability
- Why it matters: Dashboard needs populated data to show cross-session insights during 2-minute demo
- Owning slice: S08

### R014 — Deploy full stack on Vultr VM at tryflow.study with Docker + Caddy auto-TLS
- Class: constraint
- Why it matters: Vultr is a sponsor track — deployment there is a judging requirement
- Owning slice: S01 ✅ done

### R015 — Mute toggle for voice cues during sessions, persisted within session
- Class: quality-attribute
- Why it matters: Some users studying don't want audio interruptions — respects user preference without disabling visual alerts
- Owning slice: S06

### R016 — Notion-esque UI — minimal, expressive typography, clean whitespace, warm neutral palette, not clinical or dark-dev-tool
- Class: quality-attribute
- Why it matters: UX and Design is a judging criterion — the UI must feel innovative and aesthetically pleasing
- Owning slice: S03 ✅ done (supporting: S07)

### R017 — Tiger Cloud hypertable with continuous aggregates (1-min, 5-min), compression policy, and gapfill for signal-lost periods
- Class: integration
- Why it matters: Tiger Cloud is a sponsor track — leveraging advanced TimescaleDB features shows technical depth
- Owning slice: S05 ✅ done

### R018 — Thought-probe system (jittered 8-12 min) recording self-report vs classifier state for accuracy validation
- Class: differentiator
- Why it matters: Turns a guess into a measurement — confusion matrix proves the classifier works to judges
- Owning slice: S04 (in progress)

### R019 — Confusion matrix on dashboard showing classifier vs self-report agreement
- Class: differentiator
- Why it matters: Proves the product works with data, not just claims — strong for Q&A with judges
- Owning slice: S07 ✅ done

### R020 — External USB webcam required — built-in Windows laptop cameras do not work with SmartSpectra SDK
- Class: constraint
- Why it matters: SDK limitation confirmed in docs — demo will fail without external camera
- Owning slice: S02 ✅ done

### R021 — All physio fields nullable during warmup periods (12s pulse, 30s breathing, 35s EDA, 60s HRV) — UI renders dash not zero
- Class: failure-visibility
- Why it matters: SDK emits confidence 0 until analysis windows fill — showing 0 is misleading, showing dash is honest
- Owning slice: S03 ✅ done

### R022 — Offline upload buffer — JSONL spill to disk on API failure, exponential backoff, replay on reconnect
- Class: continuity
- Why it matters: Demo must survive network hiccups — 60s offline with zero data loss
- Owning slice: S05 ✅ done

### R023 — Pre-cached ElevenLabs fallback audio files for voice cues
- Class: continuity
- Why it matters: Demo voice intervention must work even if ElevenLabs API is down
- Owning slice: S06

### R024 — FDA disclaimer — wellness only, not medical. Say camera-based physiological sensing, never imply clearance
- Class: constraint
- Why it matters: SDK metrics are not FDA cleared — legal compliance and credibility
- Owning slice: S01 ✅ done

## Out of Scope

### R025 — No auth, accounts, or multi-user support — device_id is identity
- Why it matters: Explicitly excluded — sign-in costs hours and earns nothing on a single-machine demo

### R026 — No mobile or cross-platform support
- Why it matters: Desktop-only scope — SmartSpectra Node.js SDK on Windows is the target

## Coverage Summary

- Active requirements: 24, all mapped to slices
- Done: S01, S02, S03, S05, S07 (16 requirements)
- Remaining: S04 (R002, R003, R010, R018), S06 (R004, R015, R023), S08 (R011, R012, R013)
