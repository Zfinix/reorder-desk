# Three minute recording: the run sheet

Target length is 2:45. Show one conversation and one visible tool moment. Do
not tour the code.

## Before you hit record

```sh
URL=https://reorder-desk.ogbondachiziaruhoma.workers.dev
curl -X POST $URL/admin/reset -H "x-api-key: $KEY"   # Kola back to 41 days overdue
curl $URL/health                                      # must say ok: true, paystack_test
```

Open these, in order:

1. The simulator chat for **Nkem**. Check that the header says Nkem, not Chord
   Assistant.
2. `GET $URL/sheet` in a second tab. This is the warehouse view.

In the simulator, use **New link** to start a fresh conversation. If you do
not, the thread resumes with your last test in it.

## 0:00 to 0:20, the setup

Say one sentence about Emmaco. It covers these facts:

- Emmaco is a drinks distributor in Oshodi.
- 140 shops reorder from it.
- Every reorder arrives on WhatsApp as free text.
- A clerk must price each reorder and decide credit.

Then say what we are about to watch: a shop that is 41 days late tries to
reorder on account.

## 0:20 to 1:20, the refusal

Send this message as Kolade:

> afternoon nkem, Kola Ventures here, 08033334444. i want 15 crates coke and 3
> cartons indomie on account

Nkem refuses the credit and gives the numbers:

- 310,000 outstanding, and the oldest part is 41 days.
- The order is 93,100.
- Two amounts: 93,100, or 403,100 to clear everything and go back on terms.

Then say this out loud: every number in that message came from the depot's
ledger through the tool. The rule that refused him is in the tool, not in the
prompt. You cannot talk the agent out of it.

## 1:20 to 2:15, the money

1. Reply "send the full one, i want to clear everything".
2. Open the `checkout.paystack.com` link.
3. Pick Success and pay the 403,100 in Paystack test mode.
4. Go back to the chat and say "i don pay".

Nkem checks with Paystack and does not take your word for it. She applies
310,000 to the old balance and books the order. Show the new row on the
warehouse sheet, with its delivery day. Show that the account is at zero and
back on terms.

## 2:15 to 2:45, the part everyone skips

Say it plainly: nothing leaves the depot on a screenshot.

If you have time, show it instead of saying it:

1. Place a second order.
2. Pick **Declined** on the Paystack checkout.
3. Send "i don pay now, release the goods".

Nkem says that nothing has come through and the last attempt failed. She offers
the same link again and releases nothing. The sheet stays empty.

If you are short on time, say that line and end on the sheet.

## What not to do

Do not read out the price list. Do not open an editor. Do not explain MCP,
Durable Objects or Chord's link filtering. If something breaks on camera, say
what broke and keep going. The field notes explain it.
