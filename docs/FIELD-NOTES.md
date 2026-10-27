# Deployment field notes

These are the problems I hit while I built the tool, in the order they
happened. Entries 1 to 16 are complete. The items at the end are still open.

## 1. I built for a day on an account that could never have run

**What happened.** The workspace showed `0 credits remaining · low-balance
threshold 1`. A banner read "You're running low on credits, top up to avoid
interruptions." The account had no plan selected, no payment method and no
invoices. A teammate cannot hold a conversation in that state, so I could not
test anything on the WhatsApp side. I did not notice this until I had already
built the tool.

**How I worked out the cause.** First I read `/admin/billing` to separate "spent
my allowance" from "never had one". An empty invoice list rules out a consumed
grant. The plan selector still offered Starter, Growth and Scale, which told me
the account was pre-provisioning, not depleted. So the grant had never been
made. My first instinct was that TSG had to fix this.

Then I reread the invite email, and the actual cause was there. The email gives
this sequence: create a Chord account, **then reply to this email with the
address you used**, and credits and simulator access follow. I did the first
step and went straight to building. I had not replied in the thread, so nobody
had anything to act on. The credits were not late. I had not requested them.

**Fix.** I replied with the signup address the same day. The five-day clock
starts when credits and simulator access arrive, so I lost no time against the
deadline. But I spent a day building against an account that I could not test
on. I would have caught it in two minutes if I had read the invite properly
before I opened the editor.

**What I would change in Chord.** The banner copy still needs a fix. It is part
of the reason my misreading lasted as long as it did. "You're running low on
credits" is wrong for an account that never had any. The only call to action is
Top up. That is the wrong action for a workspace whose credits are supposed to
arrive from somebody else. An account that is still pre-provisioning should say
so, and say who grants the credits. A workspace that cannot run a single turn
should also say so where you start a teammate, not only on the billing page.

## 2. The API contract is unreadable without a key, including from a logged-in session

**What happened.** My first move was to generate a client from the OpenAPI
contract. `GET https://api.chordhq.xyz/openapi.json` returns `HTTP 401 Unauthorized` with
no body. `/api/openapi.json` and `/v1/openapi.json` return the same.
`/docs/openapi.json` returns a 404. The docs overview names the contract as the
source to generate a client from.

**How I worked out the cause.** I fetched all four candidate paths from an
authenticated browser session on the same origin, with cookies attached. Every
path that exists returned 401. That rules out a CORS or cookie-scope
explanation: the gateway wants a bearer key, and a first-party dashboard session
is not one. The docs say the same thing later, in Authentication. A session JWT
and an API key use the same header, but they come from different issuers. The
identity cookie "cannot authenticate API or partner calls."

**It is worse than a permissions problem.** When I had a working key, I tried
again. I expected the 401 to become a 200. `GET /openapi.json` with a valid
`Authorization: Bearer chord_live_...` returns **HTTP 404 NOT_FOUND**.
`/v1/openapi.json`, `/openapi` and `/v1/spec` return the same. The API host does
not serve the document at all. The first 401 came from the gateway, which
rejects an unauthenticated request before routing. That made it look like a
scope problem, but the resource was absent. The docs describe "the
machine-readable `openapi.json` contract" and say to "generate your client from
the committed copy". That suggests the file lives in a repository that an
external builder cannot see.

**Fix or workaround.** I read the guides instead. They are complete enough to
build against. The curl examples on each page carry the request bodies that the
reference would have given me.

**What I would change in Chord.** Serve `openapi.json`, and serve it
unauthenticated. It is a contract, not data. Today the docs promise a
machine-readable contract that does not exist at the URL they imply. An
unauthenticated reader gets a 401, which points them at a credentials problem
instead of a missing file. The rendered reference at `/docs/api` does not
replace it. The page is client-rendered, so `curl` and any agent that fetches it
get a page whose only text is the string "Chord API Reference". If the spec is
only in an internal repo, say so on the page instead of linking to it.

## 3. The docs made me build the wrong kind of tool first

**What happened.** The only page in the documentation nav about tool
integration is "MCP connections". The capability list in the overview says tools
are assigned "via MCP connections". On that basis, I built the integration as an
MCP server. But `/admin/channels`, then Tools, shows three kinds of custom tool:
**Custom tools (MCP)**, **Custom tools (API)** with "Declare an endpoint by hand
and the AI can call it, just like an MCP server", and an **Import OpenAPI**
button.

**How I worked out the cause.** I had already shipped the MCP server when I
opened the Tools tab in the app. The REST option was next to it. The docs nav
has 25 pages, and none of them covers custom REST tools or the OpenAPI import.

**Fix.** None was needed. MCP was the better choice for this tool, because it
keeps the tool list and schemas in my repo instead of declared by hand in a
form. But I spent that time because I believed it was the only choice. The
plain-HTTP version I wrote first was wasted work.

**What I would change in Chord.** Document custom REST tools and the OpenAPI
import. They are a first-class feature in the product, and the docs do not show
them. A short page could say "three ways to add a tool, pick MCP when you own a
server, pick REST when you own an endpoint, import OpenAPI when you have a
spec". That page would have saved me an hour, and it would change what a builder
ships.

## 4. "MCP" alone did not tell me what to serve

**What happened.** MCP has several transports. If you know that Chord speaks
MCP, you still do not know whether to serve stdio, the deprecated HTTP+SSE pair,
or Streamable HTTP. If you choose wrong, the server registers fine and never
answers.

**How I worked out the cause.** The second paragraph of the MCP connections page
answers it: Streamable HTTP, public HTTPS, and "Chord sends JSON POST requests
and accepts JSON or SSE responses". It specifies `transport: "streamable_http"`.
It says explicitly that `http_sse` is a stored compatibility value that does not
enable a legacy GET-SSE transport. The documentation is good, but I found it
only after I went looking for it.

**Fix.** The server answers JSON-RPC over `POST /mcp` and returns
`application/json`. Registration uses `auth_type: "api_key"`. The docs say Chord
sends this as `X-API-Key`, which matches what the server checks.

**What I would change in Chord.** Put the transport and the protocol version in
the comments of the registration example, and state them on the Quickstart too.
Also say clearly what a tool error looks like to the model. That decides how
tool authors write their failure messages.

## 5. Loopback is blocked, so there is no local-first path

**What happened.** The outbound URL policy blocks private, loopback and internal
addresses in hosted deployments, for both MCP server URLs and external-chat
callback URLs. There is no way to point Chord at a server on your laptop.

**How I worked out the cause.** The MCP connections page states it plainly. The
external chat section states it again, and documents that a private callback URL
comes back `400 BAD_REQUEST`.

**Fix.** The tool is a Cloudflare Worker, live at
`https://reorder-desk.ogbondachiziaruhoma.workers.dev`. The move off the laptop
improved the design. The tool keeps its state in a Durable Object. A Durable
Object handles one request at a time and commits the writes of a tick
atomically, so the credit check cannot interleave with itself. A review found
three failure modes in the JSON files it replaced. The container filesystem was
read-only. A crash mid-write left a truncated file. Two simultaneous orders could
both pass the credit check. `PUBLIC_BASE_URL` is a required setting, and the
Worker does not derive it from the Host header of the request. So a
misconfigured deploy fails loudly, and does not send retailers a payment link
pointed at somebody else's domain.

**What I would change in Chord.** Say it on the Quickstart, not only on the MCP
page. Also name the recommended tunnel or host for development. A builder who
discovers this after writing a local tool loses the afternoon.

## 6. Delivery cutoffs were being judged in the wrong timezone

**What happened.** The demo booked an Ikeja delivery for the next day and
reported `this_week: true` for a date six days out. Both results looked
plausible, so they were easy to miss.

**How I worked out the cause.** I read the slot logic against the output.
`nextSlot` used `Date#getDay` and `Date#getHours`, which return the local time
of the host. A depot in Oshodi loads trucks on Lagos time. So any host not set to
`Africa/Lagos` moves the 4pm cutoff, and a host far enough west also changes the
weekday. The `this_week` flag was wrong for a separate reason: it meant "fewer
than seven days away", which is true of next Tuesday.

**Fix.** `src/lib/delivery.ts` derives the weekday and hour of the depot through
`Intl.DateTimeFormat` with `timeZone: "Africa/Lagos"`. It does its date
arithmetic on that date string. I replaced `this_week` with `days_away` and
`missed_this_week`, which cannot be read two ways.

**What I would change.** This one is mine, not Chord's. The transferable lesson
is that an agent that promises a day needs its timezone pinned at the point of
decision. If a Chord teammate can carry a business timezone, put it in the
tool-call context. Then each tool author does not have to invent it.

## 7. The key UI cannot grant the permissions the MCP docs require

**What happened.** The MCP connections page lists the permissions a key needs:
`mcp:create`, `mcp:read`, `mcp:manage`, plus `teammate:read` and
`teammate:update`. The Create API key dialog offers Chat, Knowledge, Teammates,
Procedures, Usage, Webhooks, a Full access checkbox and a privileged Trusted
context toggle. There is no MCP group, and no way to tick `mcp:*` on its own.

**How I worked out the cause.** I opened the dialog and read every group. Then I
created a key with Full access and read the scope list that the key page prints
back. Full access does include `mcp:create`, `mcp:read` and `mcp:manage`. It
also includes about seventy other scopes, such as `user:manage`, `role:manage`
and `conversation:delete`.

**Fix.** I used a Full access key, and it works.

**What I would change in Chord.** This is the one thing I would fix first. The
docs tell a builder to scope a key to the five permissions the integration
needs. The product makes that impossible. So every MCP integration holds a key
that can also delete conversations and manage roles. Either expose an MCP group
in the dialog, or let the API mint a scoped key and say so in the guide. The
dialog already says "Scope the key to only what the integration needs", but it
does not let you follow that advice.

## 8. A brand-new teammate cannot be given a skill until it is migrated

**What happened.** I created a teammate, then posted the skill package to
`POST /v1/teammates/{id}/skills`. It returned
`400 FAILED_PRECONDITION: "Initialize skills from existing instructions before
modifying them"`.

**How I worked out the cause.** The skills page documents
`POST /v1/teammates/{id}/skills/migrate` under a heading about *migrated*
teammates. It describes the call as "capture stable legacy sources and
atomically enable published skill instructions". I read that as a one-off for
teammates created before skills existed, so I skipped it for a teammate made ten
seconds earlier. The error says "existing instructions", which also reads like
it is about legacy content. It is not: every teammate starts unmigrated, and
`/migrate` is the call that turns skills on. I posted it with an idempotency
key. It returned `{"enabled": true, "generation": 1, "editable": true, "skills": []}`,
and then the create worked.

**Fix.** Call `/skills/migrate` once, immediately after you create a teammate
and before any skill write.

**What I would change in Chord.** Rename it, or stop requiring it. "Migrate"
describes the legacy case, but the call is mandatory for every new teammate.
Failing that, make the error state the remedy: "call POST
/v1/teammates/{id}/skills/migrate first" instead of "initialize skills from
existing instructions". Also put that sentence in the first paragraph of the
skills page. I lost ten minutes to an error that named no endpoint.

## 9. Publishing really is a separate step, and the version numbers are not the same number

**What happened.** Nothing failed here. But this is the trap the docs warn
about, so I record what it looks like from the other side. Creating the skill
returned `version: 1, published_version: 0, published_revision_id: null`. The
skill existed, the teammate had it attached, and none of it was live. Publishing
with `{"expected_version": 1, ...}` returned `version: 2, published_version: 1`
and a `published_revision_id`.

**How I worked out the cause.** I read the two fields against each other.
`version` is the concurrency token. It increments on every mutation, including
the publish itself. `published_version` counts published revisions. They are
never equal after the first publish, so a check on the wrong one tells you
nothing about whether anything is live.

**Fix.** Publish right after create. Assert that `published_revision_id` is
non-null, and do not assert on any version number.

**What I would change in Chord.** The field names are fine, but an explicit
`live: false` would make the create response clearer. A builder who reads
`version: 1` on a 201 can reasonably conclude that something shipped.

## 10. Chord blocks a payment link that came from a custom tool

**What happened.** The whole build depends on one message: the agent refuses
credit and sends a payment link. In the simulator, Nkem got as far as the link,
but the customer received this instead:

> Blocked a reply with a payment link that didn't come from the booking tools
> (https://reorder-desk.ogbondachiziaruhoma.workers.dev/simulator/pay?reference=EMM-0002-134826).
> This is what a WhatsApp customer would get instead:
> "Sorry, something went wrong setting up your payment link, so please don't use
> any link I sent just now. Reply continue and I'll check where your booking
> stands."

The tool call succeeded. The tool priced the order, made the right credit
decision and minted the link. Chord stripped it on the way out.

**How I worked out the cause.** The simulator prints the block reason above the
substituted reply. That is good product design, and it is the only reason I
found this in one turn instead of three. The phrase "didn't come from the
booking tools" is the whole explanation. Chord allows payment links in outbound
messages only when they come from a recognised first-party connector, presumably
Bookings and Paystack. Chord does not trust a URL that a custom MCP tool
returns, whatever it points at. I checked `/docs/workspace-governance/` for an
allowlist or a trusted-domain setting, and there is none. The MCP connector also
has no detail page where I could approve a domain.

**Fix, and the correction to my first conclusion.** My first reading was that
Chord refuses any link a custom tool produces. That was wrong, and I am leaving
the wrong version visible because the correction is the useful part.

Chord stripped
`https://reorder-desk...workers.dev/simulator/pay?reference=...`. That link came
from the fake payment provider I ship for offline testing. Then I put a real
Paystack test key on the Worker and connected Chord's Paystack connector. The
same tool returned `https://checkout.paystack.com/bphjl8354ciovjt`, and Chord
delivered it to the customer untouched. The policy is about the destination, not
about which tool produced it.

**The honest caveat:** I changed two things at once: the key and the connector.
So this run alone cannot tell me where the allowance comes from. It can come
from the URL being a known payment domain, or from Paystack being a connected
connector in the workspace. A proper test means I disconnect Paystack and
resend. That costs credits I would rather spend on the demo. Either way the rule
for a builder is the same: send links to a recognised payment domain, and
connect the matching connector before you test.

Then the full chain worked end to end against Paystack test mode. It made a real
checkout for 403,100 naira and took a real test payment. It verified the payment
against Paystack and applied 310,000 to the old balance. The account went back
on terms at zero, and the order went on the Ikeja run for Thursday 29 October.

**What I would change in Chord.** The policy itself is right. An agent that can
put any URL in front of a customer is a phishing engine. Refusing unknown
destinations is the correct default. Two things around it need work.

First, document it. The MCP connections page, the skills page and the governance
page do not say that outbound links are filtered by destination. Every builder
whose tool returns a link finds out the way I did: in a live conversation, after
the integration is built.

Second, say which link was blocked and why, in a form the *builder* sees. The
simulator showed me the blocked URL. That is the only reason this took one turn
instead of an afternoon, but it is a simulator affordance. On a real number the
customer gets the apology and the builder gets nothing. A delivery log entry
that says "link to host X blocked, host not in the allowed set" would close the
gap. For a business whose payment page is its own domain, a per-workspace
allowlist of destinations would be better still.

## 11. The model never sends the field name the schema asks for

**What happened.** `create_order` kept failing, and the agent kept retrying in
the chat. Temporary logging on the Worker showed four consecutive calls. None of
them matched my schema, which declared `items: [{query, qty}]` with both fields
required:

```
create_order args={"items":["15 crates coke","3 cartons indomie"]}
create_order args={"items":[{"item":"coke","quantity":15}, ...]}
create_order args={"items":[{"sku":"COKE-50CL-12","qty":15}, ...]}
create_order args={"items":[{"name":"Coca-Cola 50cl","quantity":15}, ...]}
```

**How I worked out the cause.** I could see 200s in `wrangler tail` but no
orders on the warehouse sheet. That told me the calls were arriving and my own
validation rejected them. They were not failing in transit. The logged arguments
showed the model trying `item`, `quantity`, `sku` and `name`, and never once
`query`. Two things follow. My field name was bad: `query` reads like a search
parameter, and nothing about an order line suggests it. And Chord does not
validate tool arguments against the `inputSchema` it discovered. So Chord
delivers a malformed call to the tool instead of correcting it before it gets
there.

**Fix.** I renamed the field to `item` and accepted `quantity` as well as `qty`.
The tool also accepts a bare string like `"15 crates coke"` and parses the
leading number. The error now states the shape it wants. All five shapes the
model tried now produce the same correct order. The schema is still the
contract. The tool is liberal in how it honours it.

**What I would change in Chord.** Validate `tools/call` arguments against the
discovered `inputSchema` and hand the model the validation error, the way other
MCP clients do. When a malformed call gets through, a correctable mistake
becomes four wasted turns. In this product, a wasted turn is a credit and a
confused customer. Failing that, say in the docs that the tool is responsible
for its own argument validation, so builders write defensively from the start.

## 12. The simulator binds a chat link to the wrong agent

**What happened.** I created a chat link for Nkem, and it was a link to Chord
Assistant. The dialog that opens is correct, and says "Testers see the business
first, the way WhatsApp shows it, with **Nkem** underneath". But the link it
creates belongs to the other agent. The chat header shows it: "Chord Assistant ·
Test chat".

**How I worked out the cause.** I reproduced it three times. I also used a real
mouse click on the Nkem row instead of a scripted one, to rule out a click on
the wrong button. Then I renamed the other teammate so that Nkem sorted first in
the list. I created the link again from the first row and got a correct Nkem
link. The dialog carries the right agent; the create call uses the first agent
in the list.

**Fix or workaround.** Rename or remove the other teammates so the one you want
sorts first. `display_name` is writable through
`PUT /v1/teammates/{id}`, so this is a one-line fix and a one-line revert.

**What I would change in Chord.** Pass the agent id the dialog already knows
into the create call. Until then the bug is close to invisible. The dialog names
the right agent, and the only sign is the chat header on a page you may not
open. A tester could easily evaluate the wrong agent and conclude the skill does
nothing.

## 13. A field marked optional is rejected as required

**What happened.** Chord's Paystack connector asks for a secret key and a
"Webhook secret (v2) **(optional)**". The help text for that field reads "Leave
blank if you're not yet on v2 webhooks." If you leave it blank and press
Connect, the form returns `webhook_secret is required`.

**How I worked out the cause.** The error names the field, which is more than
most of Chord's errors do. There was nothing to diagnose, only to disbelieve.

**Fix.** I put a placeholder string in it. We do not consume Chord's Paystack
webhooks, because verification goes through our own tool against the Paystack
API. So a value that matches no real signing secret costs nothing here. It would
quietly break webhook verification for anyone who did rely on it.

**What I would change in Chord.** Make the field optional as labelled, or drop
the "(optional)" and the "leave blank" sentence. Now the form tells you to do
the one thing it rejects. The fix is to invent a secret, and a careful person
will not do that unprompted.

## 14. An empty MCP assignment hands your tools to every teammate

**What happened.** I pinned my MCP server to Nkem with `set_mcp_server_ids`.
Later a conversation routed to the default Chord Assistant instead, and it
answered correctly. It called `lookup_account` and `create_order`. It quoted the
right 93,100 total and the right 41 days overdue, and offered both payment
amounts. A teammate I never gave the tools to was running the depot's credit
rules.

**How I worked out the cause.** This one is documented, and I had read it:
"An empty or omitted `mcp_server_ids` means all enabled MCP servers in the
workspace... For exclusive access, give every relevant teammate an explicit
server list before enabling it. An empty list is not a way to deny MCP access."
Pinning the server to Nkem does not unpin it from anyone else. Every other
teammate with no explicit list gets it by default.

**Fix.** Either give every other teammate an explicit list that excludes yours,
or retire the ones you are not using. In this workspace that is one unused
default assistant, so it does not matter. In a real tenant, this is how a sales
teammate ends up able to release stock.

**What it accidentally proved.** The two replies are a clean before-and-after
for what a skill is worth. The tools were identical, and only the instructions
differed. The Chord Assistant answered in markdown, with bold headers, a
bulleted price breakdown and numbered options. It addressed the customer as
"Kola" and explained that the delivery day was provisional. Nkem said:

> Kolade, I cannot put this on credit. There is 310,000 naira outstanding and
> the oldest part is 41 days, so the depot has the account on cash until it
> clears.

Same tools, same numbers. One of those is a WhatsApp message and the other is a
report.

**What I would change in Chord.** Default a new MCP server to no teammates
instead of all teammates, and make `set_mcp_server_ids: []` mean what it looks
like. The current default is the unsafe one. The warning in the documentation
does work that the API should do.

## 15. The agent priced the same order twice

**What happened.** When I tested the declined path, the conversation produced
two orders for one request. `EMM-0001` came from the first reply. `EMM-0002`
came when the retailer picked which amount to pay, and the payment link was
attached to it. The first order stayed open and unpaid.

**How I worked out the cause.** I read both orders back after the conversation.
`EMM-0001` had `payment: null`, and `EMM-0002` carried the checkout URL. Both
had the same shop, the same two lines and the same total. The model re-priced
the order instead of reusing the id it already had. From its point of view, that
is reasonable. It had no reason to believe that `create_order` was expensive, or
that a second call meant anything.

In this case it did no harm, because a `cash_required` order holds no credit. On
the approved-on-terms path it would do harm. Unreleased orders count against the
shop's limit, so a duplicate would hold the credit twice. Then the second
genuine order of the day would be refused for no reason.

**Fix.** I fixed both halves, because the prompt alone is not a guarantee.
`create_order` now fingerprints the lines. If an unreleased order with the same
fingerprint already exists for that shop, it returns that order with
`already_on_file: true` and does not create another. I tested it: the same call
twice returns `EMM-0001` both times. The skill now also tells the agent to keep
using the order id it already has. It says that `already_on_file` means the same
order, not a new one.

**What I would change.** This one is mine. The transferable lesson is that any
tool an agent can call twice should be idempotent, or say loudly that it is not.
"The model will only call it once" is not a property you control.

## 16. Paystack test mode approves a bank transfer nobody made

**What happened.** When I tested the on-hold account, the checkout opened on the
Transfer channel instead of Card. It showed an account number, an amount and a
button that read "I've sent the money". I clicked it without sending anything.
That is exactly the fake-transfer scenario this agent exists to stop. Paystack
showed "We're waiting to confirm your transfer". I then told Nkem the money had
landed, and Nkem released the order.

**How I worked out the cause.** My first thought was that the agent had taken
the customer's word. That would have been the worst possible bug. It had not. I
queried Paystack directly for that reference:

```
status           : success
channel          : bank_transfer
gateway_response : Approved
amount           : 6010000
paid_at          : 2026-10-22T16:11:51Z
```

Paystack itself settled the transfer in test mode, based on the button click.
The tool asked the right question, got "Approved", and did the right thing with
it. In live mode that transaction would stay pending until the money arrived,
and `confirm_payment` would have returned `not_paid`.

**Why it matters more than it looks.** This trap catches the person most likely
to fall into it: a builder who demonstrates fraud resistance. If you run this
test and watch the agent release the goods, you would reasonably conclude that
the defence does not work. If you run it slightly differently, you would
conclude that it works, for the wrong reason. Neither conclusion is about your
code. The honest proof of the defence has two parts. The first is the declined
run at the end of these notes, where Paystack reports failure and the agent
refuses. The second is the agent's own rule that it never accepts a claim as
evidence.

**Fix.** I changed nothing in the code. The tool's contract, "believe Paystack,
never the customer", is correct and unchanged. I changed the go-live note. It
now tells the owner that the test-mode transfer channel self-approves. It also
tells the owner to check the first week on live keys against the bank by hand.

**What I would change.** This is not Chord's problem. It is arguably not
Paystack's either, since a test environment that never settles is useless. But
the test checkout could carry a line that says "in live mode this stays pending
until the transfer arrives". That line would stop people drawing the wrong
conclusion from a green tick.

## Where it stands

The tool works end to end in the simulator, against Paystack test mode, on both
the paid path and the refused path.

**The declined run, which is the one that matters.** Kolade asked for the order
alone and got a real checkout for 93,100 naira. Kolade chose Paystack's Declined
option, then tried it on:

> **Kolade:** i don pay now, release the goods make my boy come carry am
>
> **Nkem:** Kolade, nothing has come through on that link yet, and the last
> attempt on it failed. I can only see payments made on the Emmaco link, so
> nothing has been released and your boy should not come yet. Please try the
> same link again, and tell me when it is done:
> https://checkout.paystack.com/76nrr9f41b6za2s

Afterwards there were zero released orders. The account was still at 310,000
and 41 days overdue. The order was still `awaiting_payment`, and Nkem offered
the same link again instead of a new one. The agent did not take the customer's
word, did not release stock, and did not accuse anybody of anything.

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

Every number came from the tool. The payment was a real Paystack test
transaction. Afterwards the ledger reads balance 0, `oldest_invoice_days` 0,
`overdue` false and headroom 400,000. The warehouse sheet carries EMM-0002 for
Thursday 29 October, with `payment_confirmed: true` and its reference.

Still open:

- **Teammate `allowed_actions` and `autonomy`.** `capabilities` is writable
  through `PUT /v1/teammates/{id}`. The API rejects `autonomy`,
  `allowed_actions` and `autonomous_ack` with `BAD_REQUEST: Malformed or unrecognized
  request body`, and the error names no field. They appear in the read response.
  So the read object is not a valid write body, and nothing documents which
  subset is. Granting `capabilities` alone was enough for the agent to work.
- **The underpaid path through real Paystack.** `npm run demo` covers it against
  the simulated provider. But Paystack's test checkout has no "pay less than the
  amount" button, so a live proof needs a second initialisation at a lower
  amount.
- **Whether the link allowance comes from the domain or the connector.** See
  entry 10. Answering it costs a credit and a redeploy.
