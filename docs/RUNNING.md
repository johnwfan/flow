# Running Flow

One way to run the stack for local development, one fast path for a live
demo, and a smoke test to run before either. The agent is always launched
separately from api/web — it binds a real webcam via the SmartSpectra native
SDK, so it can't run in a container or be silently backgrounded.

## One-time setup

```
pnpm install
cp .env.example .env               # fill in TIGER_CLOUD_URL, GEMINI_API_KEY, ELEVENLABS_API_KEY
cp apps/agent/.env.example apps/agent/.env   # fill in SMARTSPECTRA_API_KEY (only needed for --real)
```

`.env` (repo root) is read by apps/api and apps/web. `apps/agent/.env` is
separate and is read only by the agent — see the note under Demo below if
you need the agent to talk to a non-default API.

If this is a fresh Tiger Cloud database, apply the schema once:

```
TIGER_CLOUD_URL=... infra/migrate.sh
```

(requires `psql`; see `infra/migrations/`).

Check what's configured at any point with:

```
pnpm check:env
```

This never prints values — only which required/optional variables are
missing and what to do about each one.

## Development — full stack with a real webcam

1. Start api + web together:

   ```
   pnpm dev:all
   ```

   This checks required env vars first (fails fast with a clear message if
   `TIGER_CLOUD_URL` is missing — api can't boot without it), then runs both
   apps with labeled, interleaved output via turbo. Watch for `API listening
   on :3001` and Next's `Ready` to know both are actually up.

   | Service | URL |
   |---|---|
   | Web | http://localhost:3000 |
   | API | http://localhost:3001 (health: `/v1/health`) |

2. In a separate terminal/window, start the agent against a real webcam:

   ```
   run.bat
   ```

   This starts one `tsx src/index.ts --real` agent window, then runs
   `pnpm --filter @flow/agent preflight -- --launch-check` before opening
   the page. The launch check verifies `SMARTSPECTRA_API_KEY`, confirms
   Windows reports the preferred camera name (`FLOW_SENSING_CAMERA_NAME`,
   default `HD Webcam`) as `OK`, connects to the local WebSocket, starts a
   short preflight session, and waits for a camera/SDK signal. If any of
   those fail, the public session page is not opened.

   SmartSpectra's device index doesn't reliably match Windows' device order,
   so the agent probes candidate indices, requires sustained validation plus
   real samples before accepting one, then remembers the last-good index for
   the named camera. Pass `--camera <n>` to try one index first. List what
   Windows currently sees with `Get-PnpDevice -Class Camera | Select-Object
   Status, FriendlyName` in PowerShell — a `Status` other than `OK` means
   that device isn't actually connected right now.

3. After the launch check passes, `run.bat` auto-opens
   `https://tryflow.study/session` (the deployed site). If you're testing
   local web/UI changes instead, open
   http://localhost:3000/session and http://localhost:3000/dashboard by
   hand — the browser tab `run.bat` opens won't point at localhost. For
   strict camera diagnostics, run `pnpm --filter @flow/agent preflight`
   manually; that version waits for decoded physiology samples.

## Demo — fastest path to a live session + dashboard

**The agent always needs a real webcam and is always started by hand**
(`run.bat`, or `run-demo.bat` if the camera isn't available) — nothing below
changes that.

- **Everything local (default):** `pnpm dev:all`, then `run.bat` in a second
  window, exactly as in Development above.

- **Web/API already deployed (e.g. to `tryflow.study`, autodeployed on
  Vultr):** you don't need `pnpm dev:all` at all — just run the agent.
  `run.bat` starts the agent, proves the camera launch path with preflight,
  then opens `https://tryflow.study/session` in your default browser so you
  can finish framing/alignment with the live page visible.
  `run-demo.bat` still opens the replay path separately. The `/session` page connects straight to the
  agent's local WebSocket (`ws://localhost:8765` by default — see
  `NEXT_PUBLIC_AGENT_WS_URL` in `.env.example`), not through the API, so
  this works over `localhost` even though the page itself is served from
  Vultr. Session data still persists through whichever API the agent is
  configured to POST to (see the note below), so it also shows up on
  `/dashboard` afterward.

  > **Note:** the root `.env.example` documents `API_BASE_URL` as the
  > "agent-side API base URL", but the agent actually loads its own
  > `apps/agent/.env` (see `apps/agent/src/index.ts`), not the root `.env`.
  > `apps/agent/.env.example` now defaults this to `https://tryflow.study`
  > so a locally-run agent persists to the live dashboard out of the box —
  > override it back to `http://localhost:3001` in `apps/agent/.env` if
  > you're running api/web locally instead (`pnpm dev:all`). If it's
  > misconfigured, the live view still works either way — persistence to
  > the API is best-effort and the WS broadcast to the browser doesn't
  > depend on it — but the session won't show up on whichever dashboard you
  > check afterward.

- **Rehearsing the dashboard without waiting on a real detection:** seed a
  realistic ~2-minute session (warmup → focused → zone-out → intervention →
  recovery) straight into the DB through the real API:

  ```
  pnpm --filter @flow/api seed:demo
  ```

  See `apps/api/scripts/seed-demo.ts`. Requires api already running and
  reachable at `API_BASE_URL` (default `http://localhost:3001`).

- **Filling the Sessions and Patterns pages with past demo history:** seed a
  repeatable set of believable prior sessions directly into the DB:

  ```
  pnpm --filter @flow/api seed:history
  ```

  See `apps/api/scripts/seed-history.ts`. By default it replaces sessions for
  `DEMO_DEVICE_ID` (default `demo-device`) with 24 past sessions. Set
  `DEMO_HISTORY_SESSIONS=40` to create more, or `DEMO_HISTORY_APPEND=1` to
  append instead of replacing. Set `DEMO_HISTORY_DRY_RUN=1` to verify the
  generated shape without touching the DB.

## Smoke test — verify wiring before a live demo

A fully automated end-to-end test isn't possible here — the sensing path
needs a real camera and the SmartSpectra native SDK, which can't run
headless. Instead:

```
pnpm smoke
```

Automates everything that *doesn't* need a camera: env vars, api reachable,
web reachable, then a full session → batch → Tiger Cloud → continuous
aggregate round trip via `seed-demo.ts`. Requires `pnpm dev:all` already
running in another terminal. Prints a manual checklist afterward for the
camera-dependent leg:

- [ ] Start the agent against a real webcam (`run.bat`) and let the launch check pass
- [ ] Confirm `/session` opens and the waveform renders within ~20s and the
      state badge leaves "warmup"
- [ ] Let a zone-out alert fire (or use `run-demo.bat` to replay a fixed
      script instead of waiting)
- [ ] Confirm the alert shows in the UI (and plays audio, if
      `ELEVENLABS_API_KEY` is set)
- [ ] End the session and confirm it appears on `/dashboard` with a
      populated timeline and narrative

Run `pnpm smoke` again any time you want to re-check wiring without
touching the camera.
