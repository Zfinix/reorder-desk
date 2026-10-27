#!/usr/bin/env bash
# Show Kola's account and the warehouse sheet from the live worker, for the recording.
# Reads REORDER_DESK_KEY from .secrets.local so the key never appears on screen.
set -euo pipefail
cd "$(dirname "$0")/.."
set -a; . ./.secrets.local; set +a
URL="${REORDER_DESK_URL:-https://reorder-desk.ogbondachiziaruhoma.workers.dev}"
get() { curl -s "$URL$1" -H "x-api-key: $REORDER_DESK_KEY"; }

get "/retailers/lookup?phone=08033334444" | bun -e '
const a = await Bun.stdin.json();
console.log(`\n${a.shop_name}`);
console.log(`  owes            ${a.balance.toLocaleString()} naira`);
console.log(`  oldest invoice  ${a.oldest_invoice_days} days`);
console.log(`  on credit?      ${a.overdue ? "NO, cash only" : "yes"}`);
console.log(`  credit free     ${a.credit_headroom.toLocaleString()} naira`);
'

get "/sheet" | bun -e '
const { released } = await Bun.stdin.json();
console.log(`\nWarehouse sheet: ${released.length} order(s) to pick`);
for (const o of released) {
  console.log(`  ${o.order_id}  ${o.retailer.shop_name.padEnd(16)} ${o.total.toLocaleString().padStart(9)}  ${o.slot.day_name} ${o.slot.date}`);
}
console.log();
'
