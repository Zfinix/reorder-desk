# Deployment field notes

The problems I hit while building and deploying the tool, in the order they
happened. Fifteen are closed. Three are still open and sit at the end.

## 1. I built for a day on an account that could never have run

**What happened.** The workspace said `0 credits remaining · low-balance
threshold 1`, with a banner: "You're running low on credits, top up to avoid
interruptions." No plan selected, no payment method, no invoices. A teammate
can't hold a conversation in that state, so I couldn't test anything on the
WhatsApp side, and I only noticed after the tool was already built.

**How I worked out the cause.** I went to `/admin/billing` first to work out
whether I had spent an allowance or never had one. The invoice list was empty,
which rules out a consumed grant, and the plan selector still offered Starter,
Growth and Scale, so the account was sitting pre-provisioning rather than
drained. At that point I assumed TSG had to fix it.

Then I reread the invite email. It says: create a Chord account, **then reply
to this email with the address you used**, and the credits and simulator access
follow. I'd done the first step and gone straight to the editor. Nobody had
anything to act on because I hadn't asked.

**Fix.** Replied with the signup address the same day. The five-day clock
starts when the credits arrive, so I lost nothing against the deadline, but I
did spend a day building against an account I couldn't test on, and two
minutes with the email would have avoided it.

**What I would change in Chord.** The banner copy. "You're running low on
credits" is wrong for an account that has never had any, and the only call to
action is Top up, which is the wrong action when someone else is supposed to be
granting them. An account that is still pre-provisioning should say so and say
who grants the credits. It should also say so where you start a teammate, not
just on the billing page.

## 2. The API contract is unreadable without a key, including from a logged-in session

**What happened.** My first move was to generate a client from the OpenAPI
contract. `GET https://api.chordhq.xyz/openapi.json` returned
`HTTP 401 Unauthorized` with no body. `/api/openapi.json` and `/v1/openapi.json`
did the same, `/docs/openapi.json` was a 404. The docs overview names that
contract as the thing to generate a client from.

**How I worked out the cause.** I fetched all four paths from an
authenticated browser session on the same origin, cookies attached. Every path
that exists still returned 401, so this wasn't CORS or cookie scope: the
gateway wants a bearer key and a dashboard session isn't one. The docs do say
this later, under Authentication. A session JWT and an API key share a header
but come from different issuers, and the identity cookie "cannot authenticate
API or partner calls."

It turned out to be worse than a permissions problem. Once I had a working key
I tried again, expecting the 401 to become a 200. `GET /openapi.json` with a
valid `Authorization: Bearer chord_live_...` returned **HTTP 404 NOT_FOUND**,
and so did `/v1/openapi.json`, `/openapi` and `/v1/spec`. The host doesn't
serve the document at all. The 401 came from the gateway rejecting an
unauthenticated request before routing, which made it look like a scope
problem when the resource was simply absent. The docs talk about "the
machine-readable `openapi.json` contract" and tell you to "generate your client
from the committed copy", which suggests the file lives in a repository an
external builder can't see.

**Fix or workaround.** I read the guides instead. They're complete enough to
build against, and the curl examples on each page carry the request bodies the
reference would have given me.

**What I would change in Chord.** Serve `openapi.json`, and serve it without
auth. Right now the docs promise a machine-readable contract that doesn't exist
at the URL they imply, and an unauthenticated reader gets a 401 that sends them
chasing a credentials problem. The rendered reference at `/docs/api` doesn't
cover for it either: the page is client-rendered, so `curl` and any agent that
fetches it gets a document whose only text is "Chord API Reference". If the spec
is internal, say that on the page instead of linking to it.

## 3. The docs made me build the wrong kind of tool first

**What happened.** The only page in the docs nav about tool integration is
"MCP connections", and the capability list in the overview says tools are
assigned "via MCP connections". So I built an MCP server. Later I opened
`/admin/channels`, then Tools, and found three kinds of custom tool: **Custom
tools (MCP)**, **Custom tools (API)** ("Declare an endpoint by hand and the AI
can call it, just like an MCP server"), and an **Import OpenAPI** button.

**How I worked out the cause.** I'd already shipped the MCP server when I saw
the REST option sitting next to it. The docs nav has 25 pages and none of them
mention custom REST tools or the OpenAPI import.

**Fix.** None needed, as it happens. MCP was the better choice here because the
tool list and schemas live in my repo instead of being declared by hand in a
form. But I only picked it because I thought it was the only option, and the
plain-HTTP version I wrote first was wasted work.

**What I would change in Chord.** Document the REST tools and the OpenAPI
import. They're a first-class part of the product and invisible in the docs. A
short page along the lines of "three ways to add a tool: MCP when you own a
server, REST when you own an endpoint, OpenAPI import when you have a spec"
would have saved me an hour and might change what people ship.

## 4. "MCP" alone did not tell me what to serve

**What happened.** MCP has several transports. Knowing that Chord speaks MCP
doesn't tell you whether to serve stdio, the deprecated HTTP+SSE pair, or
Streamable HTTP, and if you pick wrong the server registers fine and then never
answers.

**How I worked out the cause.** The second paragraph of the MCP connections
page has it: Streamable HTTP over public HTTPS, "Chord sends JSON POST requests
and accepts JSON or SSE responses", `transport: "streamable_http"`. It even says
that `http_sse` is a stored compatibility value and does not enable a legacy
GET-SSE transport. Good documentation, I just found it after going looking.

**Fix.** The server answers JSON-RPC on `POST /mcp` and returns
`application/json`. Registration uses `auth_type: "api_key"`, which Chord sends
as `X-API-Key`, and that's what the server checks.

**What I would change in Chord.** Put the transport and protocol version in the
comments of the registration example and on the Quickstart. And say what a tool
error looks like to the model, because that decides how tool authors write
their failure messages.

## 5. Loopback is blocked, so there is no local-first path

**What happened.** The outbound URL policy blocks private, loopback and internal
addresses in hosted deployments, for MCP server URLs and external-chat callback
URLs alike. You cannot point Chord at a server on your laptop.

**How I worked out the cause.** The MCP connections page says so plainly, and
the external chat section says it again and documents the `400 BAD_REQUEST`
you get for a private callback URL.

**Fix.** The tool became a Cloudflare Worker, live at
`https://reorder-desk.ogbondachiziaruhoma.workers.dev`. Moving off the laptop
improved the design more than I expected. State now lives in a Durable Object,
which handles one request at a time and commits a tick's writes atomically, so
the credit check can't interleave with itself. A review of the JSON files it
replaced found three ways they could fail: a read-only container filesystem, a
truncated file after a crash mid-write, and two simultaneous orders both passing
the credit check. `PUBLIC_BASE_URL` is a required setting that the Worker
refuses to derive from the Host header, so a misconfigured deploy fails loudly
instead of sending retailers a payment link on someone else's domain.

**What I would change in Chord.** Say it on the Quickstart, not only on the MCP
page, and name a recommended tunnel or host for development. Anyone who finds
this out after writing a local tool loses the afternoon.

## 6. Delivery cutoffs were being judged in the wrong timezone

**What happened.** The demo booked an Ikeja delivery for the next day and
reported `this_week: true` for a date six days out. Both looked plausible,
which is why they were easy to miss.

**How I worked out the cause.** I read the slot logic against the output.
`nextSlot` used `Date#getDay` and `Date#getHours`, which give the host's local
time, and a depot in Oshodi loads trucks on Lagos time. Any host not set to
`Africa/Lagos` moves the 4pm cutoff, and a host far enough west changes the
weekday too. `this_week` was wrong for a different reason: it meant "fewer than
seven days away", which is true of next Tuesday.

**Fix.** `src/lib/delivery.ts` now derives the depot's weekday and hour through
`Intl.DateTimeFormat` with `timeZone: "Africa/Lagos"` and does its date
arithmetic on that date string. `this_week` became `days_away` and
`missed_this_week`, which can't be read two ways.

**What I would change.** Mine, not Chord's. But an agent that promises a day
needs its timezone pinned at the point of decision, and if a Chord teammate can
carry a business timezone, putting it in the tool-call context would save every
tool author from inventing it.

## 7. The key UI cannot grant the permissions the MCP docs require

**What happened.** The MCP connections page lists the permissions a key needs:
`mcp:create`, `mcp:read`, `mcp:manage`, plus `teammate:read` and
`teammate:update`. The Create API key dialog offers Chat, Knowledge, Teammates,
Procedures, Usage, Webhooks, a Full access checkbox and a Trusted context
toggle. There is no MCP group and no way to tick `mcp:*` on its own.

**How I worked out the cause.** I read every group in the dialog, then created
a Full access key and read the scope list the key page prints back. Full access
does include the three `mcp:` scopes. It also includes about seventy others,
`user:manage`, `role:manage` and `conversation:delete` among them.

**Fix.** A Full access key. It works.

**What I would change in Chord.** If I could fix one thing it would be this.
The docs tell you to scope the key to the five permissions the integration
needs and the product makes that impossible, so every MCP integration ends up
holding a key that can also delete conversations and manage roles. Either add
an MCP group to the dialog or let the API mint a scoped key and say so in the
guide. The dialog already says "Scope the key to only what the integration
needs". It just won't let you.

## 8. A brand-new teammate cannot be given a skill until it is migrated

**What happened.** I created a teammate and posted the skill package to
`POST /v1/teammates/{id}/skills`. It came back
`400 FAILED_PRECONDITION: "Initialize skills from existing instructions before
modifying them"`.

**How I worked out the cause.** The skills page documents
`POST /v1/teammates/{id}/skills/migrate` under a heading about *migrated*
teammates and describes it as "capture stable legacy sources and atomically
enable published skill instructions". I read that as a one-off for teammates
created before skills existed and skipped it for a teammate I'd made ten
seconds earlier. The error's "existing instructions" reads like legacy content
too. Neither is right: every teammate starts unmigrated and `/migrate` is the
call that switches skills on. I posted it with an idempotency key, got
`{"enabled": true, "generation": 1, "editable": true, "skills": []}`, and the
create went through.

**Fix.** Call `/skills/migrate` once, straight after creating a teammate and
before any skill write.

**What I would change in Chord.** Rename it or stop requiring it. "Migrate"
describes the legacy case, but the call is mandatory for every new teammate.
Failing that, make the error name the remedy ("call POST
/v1/teammates/{id}/skills/migrate first") and put that sentence in the first
paragraph of the skills page. Ten minutes lost to an error that named no
endpoint.

## 9. Publishing really is a separate step, and the version numbers are not the same number

**What happened.** Nothing failed here, but this is the trap the docs warn
about and I want to record what it looks like from the other side. Creating the
skill returned `version: 1, published_version: 0, published_revision_id: null`.
The skill existed and the teammate had it attached, and none of it was live.
Publishing with `{"expected_version": 1, ...}` returned
`version: 2, published_version: 1` and a `published_revision_id`.

**How I worked out the cause.** Reading the two fields against each other.
`version` is the concurrency token and increments on every mutation, the
publish included. `published_version` counts published revisions. After the
first publish they are never equal, so checking the wrong one tells you nothing
about whether anything is live.

**Fix.** Publish right after create, assert that `published_revision_id` is
non-null, and don't assert on either version number.

**What I would change in Chord.** The field names are fine, but an explicit
`live: false` on the create response would help. Someone who sees `version: 1`
on a 201 can reasonably think something shipped.

## 10. Chord blocks a payment link that came from a custom tool

**What happened.** The whole build hangs on one message: the agent refuses
credit and sends a payment link. In the simulator Nkem got as far as the link
and the customer received this instead:

> Blocked a reply with a payment link that didn't come from the booking tools
> (https://reorder-desk.ogbondachiziaruhoma.workers.dev/simulator/pay?reference=EMM-0002-134826).
> This is what a WhatsApp customer would get instead:
> "Sorry, something went wrong setting up your payment link, so please don't use
> any link I sent just now. Reply continue and I'll check where your booking
> stands."

The tool call had succeeded. The order was priced, the credit decision was
right, the link was minted. Chord stripped it on the way out.

**How I worked out the cause.** The simulator prints the block reason above the
substituted reply, which is good product design and the only reason this took
one turn instead of three. "Didn't come from the booking tools" seemed to
explain everything: Chord allows payment links in outbound messages only when
they come from a recognised first-party connector, presumably Bookings and
Paystack, and doesn't trust a URL from a custom MCP tool whatever it points at.
I checked `/docs/workspace-governance/` for an allowlist or trusted-domain
setting and found none, and the MCP connector has no detail page where a domain
could be approved.

**Fix, and a correction.** My first reading was that Chord refuses any link a
custom tool produces. That was wrong, and I've left it in above because the
correction is the useful bit.

The link that got stripped,
`https://reorder-desk...workers.dev/simulator/pay?reference=...`, came from the
fake payment provider I ship for offline testing. After I put a real Paystack
test key on the Worker and connected Chord's Paystack connector, the same tool
returned `https://checkout.paystack.com/bphjl8354ciovjt` and Chord delivered it
untouched. The policy is about the destination.

One caveat I can't close yet: I changed two things at once, the key and the
connector, so this run alone doesn't tell me whether the allowance comes from
the URL being a known payment domain or from Paystack being a connected
connector in the workspace. The proper test is to disconnect Paystack and
resend, and that costs credits I'd rather spend on the demo. Either way the
rule for a builder is the same: send links to a recognised payment domain, and
connect the matching connector before you test.

From there the chain worked end to end against Paystack test mode. A real
checkout for 403,100 naira, a real test payment, verified against Paystack,
310,000 applied to the old balance, the account back on terms at zero and the
order on the Ikeja run for Thursday 29 October.

**What I would change in Chord.** The policy itself is right. An agent that can
put any URL in front of a customer is a phishing engine, and refusing unknown
destinations is the correct default. What's missing is around it.

It isn't documented. The MCP connections page, the skills page and the
governance page don't say outbound links are filtered by destination, so every
builder whose tool returns a link finds out the way I did, in a live
conversation, after the integration is built.

And the builder never sees the block. The simulator showed me the blocked URL,
which is a simulator affordance. On a real number the customer gets the apology
and the builder gets nothing. A delivery log entry saying "link to host X
blocked, host not in the allowed set" would close that gap, and a per-workspace
allowlist would do better still for a business whose payment page is its own
domain.

## 11. The model never sends the field name the schema asks for

**What happened.** `create_order` kept failing and the agent kept retrying in
the chat. Temporary logging on the Worker showed four consecutive calls, none
matching my schema, which declared `items: [{query, qty}]` with both fields
required:

```
create_order args={"items":["15 crates coke","3 cartons indomie"]}
create_order args={"items":[{"item":"coke","quantity":15}, ...]}
create_order args={"items":[{"sku":"COKE-50CL-12","qty":15}, ...]}
create_order args={"items":[{"name":"Coca-Cola 50cl","quantity":15}, ...]}
```

**How I worked out the cause.** `wrangler tail` showed 200s but the warehouse
sheet had no orders, so the calls were arriving and my own validation was
rejecting them. The logged arguments showed the model reaching for `item`,
`quantity`, `sku` and `name`, and never once `query`. My field name was bad,
for a start: `query` reads like a search parameter and nothing about an order
line suggests it. The other half is that Chord doesn't validate tool arguments
against the `inputSchema` it discovered, so a malformed call is delivered to
the tool rather than corrected before it gets there.

**Fix.** Renamed the field to `item`, accepted `quantity` as well as `qty`,
accepted a bare string like `"15 crates coke"` by parsing the leading number,
and made the error state the shape it wants. All five shapes the model tried
now produce the same correct order. The schema is still the contract, the tool
is just lenient about honouring it.

**What I would change in Chord.** Validate `tools/call` arguments against the
discovered `inputSchema` and hand the model the validation error, the way other
MCP clients do. Letting a malformed call through turns one correctable mistake
into four wasted turns, and here a wasted turn is a credit and a confused
customer. Failing that, say in the docs that the tool is responsible for its own
argument validation so people write defensively from the start.

## 12. The simulator binds a chat link to the wrong agent

**What happened.** I created a chat link for Nkem and got a link to Chord
Assistant. The dialog is correct, it says "Testers see the business first, the
way WhatsApp shows it, with **Nkem** underneath". The link it creates belongs to
the other agent, and the chat header gives it away: "Chord Assistant · Test
chat".

**How I worked out the cause.** Reproduced it three times, once with a real
mouse click on the Nkem row rather than a scripted one, to rule out me clicking
the wrong button. Then I renamed the other teammate so that Nkem sorted first,
created the link again from the first row, and got a correct Nkem link. The
dialog carries the right agent and the create call uses the first agent in the
list.

**Fix or workaround.** Rename or remove the other teammates so the one you want
sorts first. `display_name` is writable through `PUT /v1/teammates/{id}`, so
it's a one-line fix and a one-line revert.

**What I would change in Chord.** Pass the agent id the dialog already knows
into the create call. Until then the bug is nearly invisible, because the dialog
names the right agent and the only sign is a chat header on a page you may
never open. A tester could evaluate the wrong agent and conclude the skill does
nothing.

## 13. A field marked optional is rejected as required

**What happened.** Chord's Paystack connector asks for a secret key and a
"Webhook secret (v2) **(optional)**", with help text that reads "Leave blank if
you're not yet on v2 webhooks." Leave it blank, press Connect, and the form
returns `webhook_secret is required`.

**How I worked out the cause.** The error names the field, which is more than
most of Chord's errors do. Nothing to diagnose, I just had to stop believing
the label.

**Fix.** A placeholder string. We don't consume Chord's Paystack webhooks, since
verification goes through our own tool against the Paystack API, so a value
that matches no real signing secret costs nothing here. It would quietly break
webhook verification for anyone who did rely on them.

**What I would change in Chord.** Make the field optional as labelled, or drop
the "(optional)" and the "leave blank" sentence. As it stands the form tells you
to do the one thing it rejects, and the way out is to invent a secret, which a
careful person won't do unprompted.

## 14. An empty MCP assignment hands your tools to every teammate

**What happened.** I pinned my MCP server to Nkem with `set_mcp_server_ids`.
Later a conversation routed to the default Chord Assistant instead, and it
answered correctly: called `lookup_account` and `create_order`, quoted the right
93,100 total and the right 41 days overdue, offered both payment amounts. A
teammate I had never given the tools to was running the depot's credit rules.

**How I worked out the cause.** This one is documented, and I had read it: "An
empty or omitted `mcp_server_ids` means all enabled MCP servers in the
workspace... For exclusive access, give every relevant teammate an explicit
server list before enabling it. An empty list is not a way to deny MCP access."
Pinning the server to Nkem doesn't unpin it from anyone else. Every teammate
with no explicit list gets it by default.

**Fix.** Give every other teammate an explicit list that excludes yours, or
retire the ones you aren't using. Here it's one unused default assistant, so it
doesn't matter. In a real tenant it's how a sales teammate ends up able to
release stock.

**What it accidentally showed.** The two replies are a neat before-and-after
for what a skill is worth, since the tools were identical and only the
instructions differed. The Chord Assistant answered in markdown with bold
headers, a bulleted price breakdown and numbered options, called the customer
"Kola", and explained that the delivery day was provisional. Nkem said:

> Kolade, I cannot put this on credit. There is 310,000 naira outstanding and
> the oldest part is 41 days, so the depot has the account on cash until it
> clears.

Same tools, same numbers, and only one of them is something you'd send on
WhatsApp.

**What I would change in Chord.** Default a new MCP server to no teammates
rather than all of them, and make `set_mcp_server_ids: []` mean what it looks
like. The current default is the unsafe one, and the warning in the docs is
doing work the API should do.

## 15. The agent priced the same order twice

**What happened.** Testing the declined path, one request produced two orders.
`EMM-0001` came from the first reply and `EMM-0002` came when the retailer
picked which amount to pay, with the payment link attached to the second. The
first stayed open and unpaid.

**How I worked out the cause.** I read both orders back afterwards. `EMM-0001`
had `payment: null`, `EMM-0002` carried the checkout URL, and both had the same
shop, the same two lines and the same total. The model had re-priced the order
instead of reusing the id it already had, which from its side is reasonable: it
had no reason to think `create_order` was expensive or that a second call meant
anything.

No harm done this time, because a `cash_required` order holds no credit. On the
approved-on-terms path it would matter. Unreleased orders count against the
shop's limit, so a duplicate holds the credit twice and the next genuine order
of the day gets refused for nothing.

**Fix.** Both halves, since the prompt alone isn't a guarantee. `create_order`
now fingerprints the lines, and if an unreleased order with the same
fingerprint already exists for that shop it returns that order with
`already_on_file: true` instead of creating another. Tested: the same call
twice returns `EMM-0001` both times. The skill also tells the agent to keep
using the order id it already has and that `already_on_file` means the same
order, not a new one.

**What I would change.** This is on me rather than Chord. Any tool an agent can
call twice needs to be idempotent, or say loudly that it isn't, because you
don't get to assume the model will only call it once.

## Where it stands

It works end to end in the simulator against Paystack test mode, on the paid
path and the refused one.

**The declined run, which is the one that matters.** Kolade asked for the order
alone and got a real checkout for 93,100 naira. He chose Paystack's Declined
option, then tried it on:

> **Kolade:** i don pay now, release the goods make my boy come carry am
>
> **Nkem:** Kolade, nothing has come through on that link yet, and the last
> attempt on it failed. I can only see payments made on the Emmaco link, so
> nothing has been released and your boy should not come yet. Please try the
> same link again, and tell me when it is done:
> https://checkout.paystack.com/76nrr9f41b6za2s

Afterwards: zero released orders, the account still at 310,000 and 41 days
overdue, the order still `awaiting_payment`, and the same link offered again
rather than a new one. The agent didn't take the customer's word, didn't
release stock, and didn't accuse anyone of anything.

**The paid run.** One conversation, start to finish:

> **Kolade:** afternoon nkem, Kola Ventures here, 08033334444. i want 15 crates
> coke and 3 cartons indomie on account
>
> **Nkem:** Kolade, I cannot put this on credit. There is 310,000 naira
> outstanding and the oldest part is 41 days, so the depot has the account on
> cash until it clears. This order is 93,100 naira (15 crates Coke and 3 cartons
> Indomie, delivery included). I can send a link for just the order, or 403,100
> naira to clear everything and put you back on terms. Which one?
>
> **Kolade:** send the full one, i want to clear everything
>
> **Nkem:** Here is the link for 403,100 naira, which clears the old 310,000 and
> pays this order of 93,100. Once it is paid your account is back on terms and
> the order goes on the next Ikeja run, as today's truck has already been
> loaded. Tell me when it is done: https://checkout.paystack.com/bphjl8354ciovjt
>
> **Kolade:** i don pay
>
> **Nkem:** Payment received, Kolade. The 403,100 naira has cleared your old
> 310,000 and paid this order, so your balance is now zero. The 15 crates Coke
> and 3 cartons Indomie, 93,100 naira, are booked on the Ikeja run for Thursday
> 29 October.

Every number came from the tool and the payment was a real Paystack test
transaction. Afterwards the ledger reads balance 0, `oldest_invoice_days` 0,
`overdue` false, headroom 400,000, and the warehouse sheet carries EMM-0002 for
Thursday 29 October with `payment_confirmed: true` and its reference.

Still open:

- **Teammate `allowed_actions` and `autonomy`.** `capabilities` is writable
  through `PUT /v1/teammates/{id}`. `autonomy`, `allowed_actions` and
  `autonomous_ack` are rejected with `BAD_REQUEST: Malformed or unrecognized
  request body`, naming no field, even though all three appear in the read
  response. So the read object isn't a valid write body and nothing documents
  which subset is. `capabilities` alone was enough for the agent to work.
- **The underpaid path through real Paystack.** `npm run demo` covers it
  against the simulated provider, but Paystack's test checkout has no "pay less
  than the amount" button, so proving it live needs a second initialisation at a
  lower amount.
- **Whether the link allowance comes from the domain or the connector.** See
  entry 10. Answering it costs a credit and a redeploy.
