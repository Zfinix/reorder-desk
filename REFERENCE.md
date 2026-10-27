# Reference

The detail behind the [README](README.md): why there is one Durable Object,
settings, the direct HTTP routes, and what the demo covers.

## Why one Durable Object

One Durable Object, named `emmaco-depot`, owns the price list, the retailer
ledger, the orders and the payment references. That is deliberate: the depot is
the thing being coordinated. Stock is shared across every shop, order numbers
are sequential, and a payment reference must be globally unique, so splitting
state per retailer would just reintroduce the races. Because a Durable Object
handles one request at a time and storage writes in a single tick are atomic,
the credit check cannot interleave with itself. An earlier version kept this
state in JSON files, and a review found three ways that broke: a read-only
container filesystem, a truncated file after a crash mid-write, and two
simultaneous orders both passing the credit check.

## Settings

| Name | Required | What it does |
| --- | --- | --- |
| `REORDER_DESK_KEY` | yes | Shared secret, as `x-api-key` or `Authorization: Bearer`. A Cloudflare secret, never a var |
| `PUBLIC_BASE_URL` | yes | Payment links are built from it |
| `PAYSTACK_SECRET_KEY` | unless simulating | Paystack **test** key, must start with `sk_` |
| `REORDER_DESK_SIMULATE_PAYMENTS` | no | `1` runs the fake provider instead of Paystack |

Anything missing or malformed and the worker serves `503` with the list of
problems, and `/health` says the same. It does not start up half-configured,
run with auth off, or quietly fall back to faking payments. The fake checkout
only exists while payments are simulated, and it settles only on a POST from its
own page, so a WhatsApp link preview cannot mark an order paid.

## Direct HTTP, for testing without an MCP client

`GET /health`, `GET /catalogue`, `GET /retailers/lookup?phone=`,
`GET /orders/:id`, `GET /sheet`, `POST /orders`, `POST /payments/init`,
`POST /payments/verify`, `POST /orders/release`. Same Durable Object behind them.
`POST /admin/reset` reseeds the depot. It works in test mode and returns 404 if
the Paystack key is a live one.

`GET /sheet` is the warehouse view: everything released, with its truck day.

## What `bun run demo` covers

It copies `.dev.vars.example` to `.dev.vars` if you have none, runs the fake
payment provider, and walks:

- the MCP handshake through the SDK client
- credit approved and released
- an overdue account refused
- a release blocked before payment
- a second payment link refused
- an abandoned checkout
- an underpayment
- a full payment that clears the old balance
- a repeat confirmation that stays idempotent
- credit that cannot be stacked across two unreleased orders
- the same order asked for twice coming back as one
- an unknown number
- an account on hold
- an item Emmaco does not carry
- an order larger than depot stock
- a partially fillable order
- a thrown handler that stays inside the tool result
- an unknown order id

To run it against the deployed worker instead:

```sh
BASE_URL=https://reorder-desk.ogbondachiziaruhoma.workers.dev \
REORDER_DESK_KEY=<the secret> bun scripts/demo.ts
```
