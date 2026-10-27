# Wiring this into Chord

Chord offers three ways to attach a tool: a custom MCP server, a hand-declared
REST endpoint, or an imported OpenAPI spec. This build uses MCP, so the tool list
and schemas live in this repo. They change when you deploy, not when you edit a
form.

Chord is the MCP client. It requires Streamable HTTP at a public HTTPS URL, and it
blocks private and loopback addresses. For that reason, this is a deployed Worker
and not a local process.

A Chord teammate has four parts: the skill, the tools, the model, and the channel.

1. **Skill.** Paste [`../skills/nkem.md`](../skills/nkem.md) as the teammate's
   skill. Keep the credit rules and the payment rules verbatim. The tool also
   enforces these rules, so the skill and the tool agree. But the skill is what
   makes Nkem explain a refusal instead of only reporting it.
2. **Tools.** Attach the worker as an MCP connection to
   `https://reorder-desk.ogbondachiziaruhoma.workers.dev/mcp`. Set
   `auth_type: "api_key"`, and set the worker's
   `REORDER_DESK_KEY` as `auth_token`. Chord sends that value as `X-API-Key`.
   `auth_type: "bearer"` also works, because the worker accepts either header.
   The worker advertises seven tools: `lookup_account`, `get_price_list`,
   `create_order`, `get_order`, `send_payment_link`, `confirm_payment`,
   `release_order`. Put all seven in `enabled_tools`.
3. **Model.** Use any model that reliably follows a numbered policy. The credit
   refusal is the hard turn, so check that turn before you ship.
4. **Channel.** WhatsApp. Test it in the simulator at <https://chat.tsglabs.dev/>.
   The simulator's sender number must match a retailer in
   the `retailers` list in [`../src/data/seed.ts`](../src/data/seed.ts). If it
   does not, every tool call returns `unknown_retailer`. Use one of these fixes:

   - Send messages from one of the seeded numbers.
   - Add the simulator's number to the seed file, deploy, and call
     `POST /admin/reset`. You need the reset because the depot plants the seed
     only once.

## Check the MCP endpoint before blaming Chord

```sh
URL=https://reorder-desk.ogbondachiziaruhoma.workers.dev
KEY=<the REORDER_DESK_KEY secret>

curl -s "$URL/health"

curl -s "$URL/mcp" -H "x-api-key: $KEY" -H 'Content-Type: application/json' \
  -d '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2025-06-18","capabilities":{},"clientInfo":{"name":"curl","version":"1"}}}'

curl -s "$URL/mcp" -H "x-api-key: $KEY" -H 'Content-Type: application/json' \
  -d '{"jsonrpc":"2.0","id":2,"method":"tools/list"}'

curl -s "$URL/mcp" -H "x-api-key: $KEY" -H 'Content-Type: application/json' \
  -d '{"jsonrpc":"2.0","id":3,"method":"tools/call","params":{"name":"lookup_account","arguments":{"phone":"+2348033334444"}}}'
```

If `/health` says `ok: true` and the three calls work, but Chord still cannot see
the tools, the problem is on Chord's side. It is transport or auth, not the
worker. `auth_type: "bearer"` also works, because the worker accepts either
header.

## Hosting

Use any host that gives you a public URL. Set `PUBLIC_BASE_URL` to that URL. If
you do not, payment links point at localhost and the retailer gets a dead link.
Set `REORDER_DESK_KEY` so that the endpoint is not open to the world, and give
Chord the same value as a header.

I already deployed it as a Cloudflare Worker at the URL above. State lives in a
Durable Object, so it survives deploys. While payments are simulated,
`POST /admin/reset` reseeds the state between takes.

A misconfigured worker does not run with auth off or with faked payments. It
serves 503 with the exact list of problems, and `/health` reports the same list.
So when something looks wrong, check `/health` first.

## Registering it

[`provision.sh`](provision.sh) runs the real registration sequence:

1. Register the server as disabled.
2. Pin the teammate with `set_mcp_server_ids`.
3. Enable the server.
4. Run the tool-discovery probe and the health probe.

Both probes are POST requests with no body. The health probe reports failure as
HTTP 200 with `status: "error"`, so read the body, not the status code.

After you edit the skill in Chord, press Publish. If you only save, customers do
not get the change.

## Why prices and payment checks live in this tool

Chord has ready-made tools for both: Catalogue for a price list, and a Paystack
connector that can create and verify payments. I keep both jobs in this build's
own tool on purpose.

- **Payment.** Suppose Nkem checks the payment with Chord's `verify_transaction`
  and then asks the tool to release the order. Then the tool must take Nkem's
  word that the shop paid. Here `release_order` asks Paystack itself, so nothing
  ships without the money, whatever the chat says. It also checks what the
  connector cannot know: that the amount covers any old balance, that the
  payment has not already released another order, and where an overpayment goes.
- **Price list.** The tool returns price, stock and the credit decision as one
  answer, so the agent cannot quote a total that the depot will not honour. You
  type Catalogue items into Chord's admin by hand, and Chord's API cannot read
  them. So a tool cannot price from Catalogue. For production, depot staff need a
  small page where they can edit prices without a deploy.

Chord's Paystack connector stays connected, because without it Chord strips the
Paystack checkout link out of the agent's reply. Field note 10 has the detail.

Two changes would let a build like this use more of Chord: an API that lets
custom tools read Catalogue, and a documented list of the link domains that Chord
strips from replies.
