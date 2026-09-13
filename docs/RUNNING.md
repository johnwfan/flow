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

2. In a separate terminal/window, start the agent against a real webcam —
   unchanged from the existing launch mechanism:

   ```
   run.bat
   ```

   This runs `npx tsx apps/agent/src/index.ts --real --camera 1` (camera
   index `1` selects an external USB webcam on the original dev machine;
   index `0` is usually the built-in laptop camera, which SmartSpectra
   can't use — list devices with `Get-PnpDevice -Class Camera | Select-Object
   Status, FriendlyName` in PowerShell and edit the number in `run.bat` if
   yours differs). Requires `apps/agent/.env` with `SMARTSPECTRA_API_KEY`
   set. If the camera fails, `run-demo.bat` replays a pre-recorded session
   instead (`--demo`).

3. Open http://localhost:3000/session to watch the live waveform, and
   http://localhost:3000/dashboard afterward for the persisted session.

## Demo — fastest path to a live session + dashboard

**The agent always needs a real webcam and is always started by hand**
(`run.bat`, or `run-demo.bat` if the camera isn't available) — nothing below
changes that.

- **Everything local (default):** `pnpm dev:all`, then `run.bat` in a second
  window, exactly as in Development above.

- **Web/API already deployed (e.g. to `tryflow.study`):** you don't need
  `pnpm dev:all` at all. The `/session` page connects straight to the
  agent's local WebSocket (`ws://localhost:8765` by default — see
  `NEXT_PUBLIC_AGENT_WS_URL` in `.env.example`), not through the API, so on
  the same machine as the agent you can just open the deployed site's
  `/session` page in a browser and start `run.bat`. Session data still
  persists through whichever API the agent is configured to POST to.

  > **Note:** the root `.env.example` documents `API_BASE_URL` as the
  > "agent-side API base URL", but the agent actually loads its own
  > `apps/agent/.env` (see `apps/agent/src/index.ts`), not the root `.env`.
  > To point a locally-run agent at a deployed API instead of
  > `http://localhost:3001`, set `API_BASE_URL` in `apps/agent/.env`, not
  > the root one. If you skip this, the live view still works either way —
  > persistence to the API is best-effort and the WS broadcast to the
  > browser doesn't depend on it — but the session won't show up on
  > whichever dashboard you check afterward.

- **Rehearsing the dashboard without waiting on a real detection:** seed a
  realistic ~2-minute session (warmup → focused → zone-out → intervention →
  recovery) straight into the DB through the real API:

  ```
  pnpm --filter @flow/api seed:demo
  ```

  See `apps/api/scripts/seed-demo.ts`. Requires api already running and
  reachable at `API_BASE_URL` (default `http://localhost:3001`).

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

- [ ] Start the agent against a real webcam (`run.bat`)
- [ ] Open `/session` and confirm the waveform renders within ~20s and the
      state badge leaves "warmup"
- [ ] Let a zone-out alert fire (or use `run-demo.bat` to replay a fixed
      script instead of waiting)
- [ ] Confirm the alert shows in the UI (and plays audio, if
      `ELEVENLABS_API_KEY` is set)
- [ ] End the session and confirm it appears on `/dashboard` with a
      populated timeline and narrative

Run `pnpm smoke` again any time you want to re-check wiring without
touching the camera.
