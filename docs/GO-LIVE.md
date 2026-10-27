# Nkem: what you are getting, and what has to be true before customers use it

**For Mr Emeka, Emmaco Ventures Ltd**

## What Nkem does

Nkem answers the reorder line. A shop sends a message the way they always have,
for example "20 crates eva, 10 malt". Nkem prices the order from your price list
and checks what that shop owes you. Then it decides on the spot if the order goes
out on credit.

Nkem uses the credit rules you gave me, and it cannot bend them. No credit if the
account is on hold. No credit if the oldest unpaid invoice is more than 30 days
old. If an order takes a shop past its limit, the whole order is cash, because
the depot does not part-fund an order. All other orders go out on 14 days'
credit.

An order that Nkem has priced but not sent out still counts against that shop's
limit. So a shop cannot get round the limit by splitting one big order into two
small ones. If a shop orders twice in a morning, the second order can come back
as cash.

When a shop cannot have credit, Nkem tells the shop plainly. It says how much the
shop owes and how old that debt is, and it sends a payment link in the same
message. If the shop wants to clear the old debt too, Nkem puts both amounts on
one link. When the shop pays that link, the account goes back on credit by
itself.

Nothing leaves the depot until the money arrives. Nkem does not accept a
screenshot, a transfer alert, or "I have sent it". It checks directly with
Paystack, the payment service, and it never lets one payment release two orders.
When Nkem confirms an order, it books the order onto the truck day for that area,
and the order appears on the warehouse sheet.

## What Nkem does not do

Nkem does not open new accounts, change prices, give discounts, or make
exceptions. It does not handle part-payments. If a shop pays less than the amount
due, Nkem tells the shop the exact shortfall, asks for the rest, and holds the
order. It does not deal with returns, empties, or questions about the driver. It
only knows the five areas on the route sheet. For anything outside these limits,
Nkem tells the shop that the depot will call them.

## Before this talks to a real customer

1. **A phone number.** You need a WhatsApp Business number that is connected to
   Chord, the platform that runs Nkem. Keep it separate from your personal line.
   The number is the account, so it should belong to the company and not to a
   member of staff.
2. **Live payment keys.** Today Nkem uses Paystack test keys, which are practice
   keys, so no real money moves. To go live, Nkem needs your own Paystack keys and
   a settlement account (the bank account that Paystack pays into).

   One warning, because this part is not reassuring. In test mode, a customer can
   pick the transfer option and press "I've sent the money". Paystack then marks
   the payment as paid at once, although the customer sent nothing, and Nkem
   releases the order. This is how the test system behaves. It is not a fault in
   Nkem. On live keys, the payment stays unconfirmed until the money arrives, and
   Nkem releases nothing before then.

   Transfers are the one path where test and live behave differently. So for the
   first week, check each transfer against the bank by hand before you trust Nkem.
3. **A real price list and a real ledger.** The ledger is the record of what each
   shop owes. Today Nkem reads a sample list of eight products and five shops.
   Before go-live, Nkem must read your actual price list and your actual balances,
   and someone must own the job of keeping them current. A stale price is worse
   than no agent.
4. **Decide who can override a refusal.** Nkem will refuse credit to a good
   customer who has a bad month. That is the point of the rules. But you need one
   named person who can say yes anyway, and you must tell the shop who that person
   is.
5. **Decide who gets woken up.** If Nkem cannot reach Paystack, it stops and tells
   the shop that it is still confirming the payment. It does not guess, and it
   does not release the order. A person must see when this happens. That means an
   alert that goes to a person, not a line in a system log.
6. **A way out of the conversation.** Any shop that asks for a human should get
   one. "A human" means a named person during depot hours.

## What it costs to run

You pay for two things. Chord charges for the conversation. WhatsApp now charges
per message: from October 2026, it is roughly ₦14 for every message that your side
sends. I wrote Nkem to put the order, the total and the delivery day in one
message instead of three. So a typical order costs a few messages, not a dozen.
Watch this for the first month, because the cheapest way to make this expensive
is a chatty agent.

## The honest risk

In the first week, you will find shops whose balance in the system does not match
what they think they owe. In those cases Nkem will be confident and wrong, because
it believes the ledger. So do this:

1. Clean the ledger first.
2. Start with one route, not all five.
3. For the first fortnight, read every refusal that Nkem sends.
