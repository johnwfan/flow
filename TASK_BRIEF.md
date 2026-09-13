# Your task: T03 — Vultr VM + Docker + Caddy

Read `TASKS.md` in this repo for the full T03 spec (section "T03: Vultr VM + Docker + Caddy"). Read `PRD.md` for product context if needed, but you don't need the whole PRD to do this task — just the Stack table and the "How it fits together" diagram.

## What to build

Files under `infra/`:
- `infra/Dockerfile` — multi-stage: build (node:20-alpine, pnpm) → runtime (prod deps only). Exposes ports 3000 (web) + 3001 (api).
- `infra/Caddyfile` — `tryflow.study` → :3000, `/v1/*` → :3001, `/ws/*` → :8765. Auto HTTPS.
- `infra/docker-compose.yml` — app + caddy services.
- `infra/deploy.sh` — SSH to Vultr, git pull, `docker compose up --build -d`.
- `infra/hello-world.js` — temp static server to verify the chain end-to-end before real apps exist.
- `.env.example` — placeholders: `TIGER_CLOUD_URL`, `GEMINI_API_KEY`, `ELEVENLABS_API_KEY`, `VULTR_SSH_HOST`. (Note: `TIGER_CLOUD_URL` belongs to T04's work happening in parallel on another branch — just include the placeholder key, don't worry about its value.)

**Verify:** Docker builds locally, Caddyfile is syntactically valid (`caddy validate` or `docker run --rm -v $(pwd)/infra/Caddyfile:/etc/caddy/Caddyfile caddy caddy validate --config /etc/caddy/Caddyfile`).

## Account setup needed (external, human does this)

- Vultr compute instance: Ubuntu 22.04, Docker marketplace app if available, 2GB+ RAM.
- SSH keypair added to the instance (generate with `ssh-keygen` if none exists).
- Note the instance's public IP → goes in `VULTR_SSH_HOST` and the DNS A record for `tryflow.study`.
- Firewall: only 22, 80, 443 open externally.
- Region: coordinate with whoever's doing T04 (Tiger Cloud) — same region reduces latency per the PRD.

## When done

Commit on this branch (`infra/t03-vultr`), then it merges into `main` independently of T04 — no shared code dependency, only the shared `.env.example` keys which are additive and won't conflict.
