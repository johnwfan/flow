#!/bin/sh
set -e

node apps/api/dist/index.js &
API_PID=$!

(cd apps/web && pnpm exec next start -p 3000) &
WEB_PID=$!

trap 'kill $API_PID $WEB_PID 2>/dev/null' TERM INT
wait $API_PID $WEB_PID
