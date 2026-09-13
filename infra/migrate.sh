#!/bin/sh
set -e

if [ -z "$TIGER_CLOUD_URL" ]; then
  echo "TIGER_CLOUD_URL is not set (check your .env)" >&2
  exit 1
fi

SCRIPT_DIR=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)

for f in "$SCRIPT_DIR"/migrations/[0-9]*.sql; do
  echo "Running $(basename "$f")..."
  psql "$TIGER_CLOUD_URL" --set ON_ERROR_STOP=1 -f "$f"
done

echo "All migrations applied."
