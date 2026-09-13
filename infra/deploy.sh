#!/usr/bin/env bash
set -euo pipefail

# Deploys apps/api + apps/web + Caddy to the Vultr droplet.
#
# Usage: VULTR_SSH_HOST=user@1.2.3.4 ./infra/deploy.sh
#
# Prerequisites on the droplet (one-time, not handled by this script):
#   - Docker + Docker Compose installed
#   - This repo cloned (path below assumes ~/flow)
#   - A `.env` file at the repo root on the droplet containing TIGER_CLOUD_URL
#     (and anything else apps/api needs) — never committed, so it must be
#     placed there separately (e.g. `scp .env "$VULTR_SSH_HOST:~/flow/.env"`).

: "${VULTR_SSH_HOST:?Set VULTR_SSH_HOST to user@droplet-ip}"

ssh "$VULTR_SSH_HOST" bash -s <<'REMOTE'
set -euo pipefail
cd ~/flow
git pull
docker compose -f infra/docker-compose.yml --env-file .env up --build -d
REMOTE
