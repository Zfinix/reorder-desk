#!/usr/bin/env bash
# Start the worker locally, reset the depot to seed state, run the whole flow, stop.
# Against a deployed worker instead:  BASE_URL=https://... REORDER_DESK_KEY=... bun scripts/demo.ts
set -euo pipefail
cd "$(dirname "$0")/.."

PORT="${PORT:-8787}"
BASE_URL="http://localhost:$PORT"
export REORDER_DESK_KEY="${REORDER_DESK_KEY:-local-dev}"

[ -f .dev.vars ] || cp .dev.vars.example .dev.vars

bunx wrangler dev --port "$PORT" > /tmp/reorder-desk-dev.log 2>&1 &
worker=$!
trap 'kill $worker 2>/dev/null || true' EXIT

for _ in $(seq 1 60); do
  curl -sf "$BASE_URL/health" > /dev/null 2>&1 && break
  sleep 0.5
done

curl -sf -X POST "$BASE_URL/admin/reset" -H "x-api-key: $REORDER_DESK_KEY" > /dev/null
BASE_URL="$BASE_URL" bun scripts/demo.ts
