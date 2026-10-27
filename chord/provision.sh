#!/usr/bin/env bash
# Register the reorder desk with Chord and pin it to the teammate.
# Every endpoint here is from api.chordhq.xyz/docs, read 2026-10-21.
set -euo pipefail

: "${CHORD_API_KEY:?create a key at chordhq.xyz/admin/api-keys, the secret is shown once}"
REORDER_DESK_URL="${REORDER_DESK_URL:-https://reorder-desk.ogbondachiziaruhoma.workers.dev}"
: "${REORDER_DESK_KEY:?the shared secret the worker checks, from wrangler secret}"
CHORD_BASE_URL="${CHORD_BASE_URL:-https://api.chordhq.xyz}"

api() { curl -sS -H "Authorization: Bearer $CHORD_API_KEY" "$@"; }

echo "== teammates visible to this key"
api "$CHORD_BASE_URL/v1/teammates"
echo
echo "Set CHORD_TEAMMATE_ID and CHORD_WORKSPACE_ID from the row you want, then rerun with them set."
: "${CHORD_TEAMMATE_ID:?}" "${CHORD_WORKSPACE_ID:?}"

echo "== register the mcp server, disabled first"
api -X POST "$CHORD_BASE_URL/v1/workspaces/$CHORD_WORKSPACE_ID/mcp-servers" \
  -H 'Content-Type: application/json' \
  --data @- <<JSON
{
  "name": "Emmaco reorder desk",
  "url": "$REORDER_DESK_URL/mcp",
  "auth_type": "api_key",
  "auth_token": "$REORDER_DESK_KEY",
  "transport": "streamable_http",
  "enabled": false,
  "enabled_tools": [
    "lookup_account",
    "get_price_list",
    "create_order",
    "send_payment_link",
    "get_order",
    "confirm_payment",
    "release_order"
  ]
}
JSON
echo
echo "Export the mcp-... id it returned as CHORD_MCP_SERVER_ID, then continue."
: "${CHORD_MCP_SERVER_ID:?}"

echo "== pin the teammate to this server"
api -X PUT "$CHORD_BASE_URL/v1/teammates/$CHORD_TEAMMATE_ID" \
  -H 'Content-Type: application/json' \
  --data "{\"set_mcp_server_ids\": [\"$CHORD_MCP_SERVER_ID\"]}"
echo

echo "== enable it"
api -X PUT "$CHORD_BASE_URL/v1/workspaces/$CHORD_WORKSPACE_ID/mcp-servers/$CHORD_MCP_SERVER_ID" \
  -H 'Content-Type: application/json' --data '{"enabled": true}'
echo

echo "== discover tools (no body, must list the six names above)"
api -X POST "$CHORD_BASE_URL/v1/workspaces/$CHORD_WORKSPACE_ID/mcp-servers/$CHORD_MCP_SERVER_ID/tools"
echo

echo "== health (no body; read status even on http 200)"
api -X POST "$CHORD_BASE_URL/v1/workspaces/$CHORD_WORKSPACE_ID/mcp-servers/$CHORD_MCP_SERVER_ID/health"
echo
