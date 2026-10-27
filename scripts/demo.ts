import { Client, StreamableHTTPClientTransport } from "@modelcontextprotocol/client";

const BASE = process.env.BASE_URL ?? "http://localhost:8787";
const KEY = process.env.REORDER_DESK_KEY ?? "";

const headers: Record<string, string> = { "Content-Type": "application/json", ...(KEY ? { "x-api-key": KEY } : {}) };

type Data = Record<string, any>;
type Called = { isError: boolean; data: Data };

const client = new Client({ name: "reorder-desk-demo", version: "2.0.0" });

const call = async (name: string, args: Record<string, unknown>): Promise<Called> => {
  const result = await client.callTool({ name, arguments: args });
  const [first] = result.content;
  if (first?.type !== "text") throw new Error(`${name}: expected a text result`);
  return { isError: result.isError === true, data: JSON.parse(first.text) };
};

const show = (label: string, { isError, data }: Called, keys?: string[]) => {
  const view = keys ? Object.fromEntries(keys.filter((k) => k in data).map((k) => [k, data[k]])) : data;
  console.log(`\n--- ${label}${isError ? "  [tool reported a problem]" : ""}`);
  console.log(JSON.stringify(view, null, 2).split("\n").slice(0, 22).join("\n"));
  return data;
};

const pay = (url: string, amount?: number) =>
  fetch(amount === undefined ? url : `${url}&amount=${amount}`, { method: "POST", headers });

const MAMA_CHI = "+2348031112222";
const BLESSING = "+2348032223333";
const KOLA = "+2348033334444";
const TOPE = "+2348035556666";

const reset = () =>
  fetch(`${BASE}/admin/reset`, { method: "POST", headers });

const run = async () => {
  await reset();
  await client.connect(new StreamableHTTPClientTransport(new URL(`${BASE}/mcp`), { requestInit: { headers } }));
  const server = client.getServerVersion();
  console.log(`connected to ${server?.name} v${server?.version}`);
  console.log(`protocol negotiated: ${client.getNegotiatedProtocolVersion()}`);
  const { tools } = await client.listTools();
  console.log(`tools: ${tools.map((t) => t.name).join(", ")}`);

  console.log("\n============ 1. clean account, credit approved ============");
  const good = show(
    "create_order",
    await call("create_order", {
      phone: MAMA_CHI,
      items: [
        { query: "eva", qty: 20 },
        { query: "malt", qty: 10 },
      ],
    }),
    ["order_id", "total", "all_items_filled", "credit", "slot_is_provisional"],
  );
  show("release_order", await call("release_order", { order_id: good.order_id }), [
    "order_id",
    "status",
    "settlement",
    "delivery_day",
  ]);

  console.log("\n============ 2. overdue account, credit refused ============");
  const overdue = show(
    "create_order",
    await call("create_order", { phone: KOLA, items: [{ query: "coke", qty: 15 }, { query: "indomie", qty: 3 }] }),
    ["order_id", "total", "credit"],
  );
  show("release before paying", await call("release_order", { order_id: overdue.order_id }), ["error", "next_step"]);
  const link = show(
    "send_payment_link include_balance",
    await call("send_payment_link", { order_id: overdue.order_id, include_balance: true }),
    ["amount_due", "reference", "covers_old_balance"],
  );
  show("a second link is refused", await call("send_payment_link", { order_id: overdue.order_id }), [
    "error",
    "reference",
    "next_step",
  ]);
  show("confirm before paying", await call("confirm_payment", { order_id: overdue.order_id }), [
    "error",
    "provider_status",
  ]);

  await pay(link.checkout_url, 5000);
  show("confirm after underpaying", await call("confirm_payment", { order_id: overdue.order_id }), [
    "error",
    "amount_due",
    "amount_paid",
    "shortfall",
    "next_step",
  ]);

  await pay(link.checkout_url, link.amount_due);
  show("confirm_payment", await call("confirm_payment", { order_id: overdue.order_id }), [
    "payment_confirmed",
    "amount_paid",
    "applied_to_old_balance",
    "kept_on_account",
    "account_balance_now",
  ]);
  show("confirm_payment again is idempotent", await call("confirm_payment", { order_id: overdue.order_id }), [
    "payment_confirmed",
    "already_confirmed",
    "next_step",
  ]);
  show("release_order", await call("release_order", { order_id: overdue.order_id }), [
    "status",
    "settlement",
    "delivery_day",
  ]);
  show("account back on terms", await call("lookup_account", { phone: KOLA }), [
    "balance",
    "oldest_invoice_days",
    "credit_headroom",
    "overdue",
  ]);

  console.log("\n============ 3. credit cannot be stacked ============");
  const first = show(
    "first order, inside the limit",
    await call("create_order", { phone: BLESSING, items: [{ item: "eva", qty: 5 }] }),
    ["order_id", "total", "credit"],
  );
  show(
    "a different second order, limit already committed",
    await call("create_order", { phone: BLESSING, items: [{ item: "coke", qty: 5 }] }),
    ["order_id", "total", "credit"],
  );
  console.log(`(first order ${first.order_id} is still unreleased, so its total is held against the limit)`);

  show(
    "the same order asked for twice is not duplicated",
    await call("create_order", { phone: BLESSING, items: [{ item: "eva", qty: 5 }] }),
    ["order_id", "already_on_file", "note"],
  );

  console.log("\n============ 4. the awkward cases ============");
  show("unknown number", await call("lookup_account", { phone: "+2348090000000" }), ["error", "next_step"]);
  show("account on hold", await call("create_order", { phone: TOPE, items: [{ query: "peak", qty: 2 }] }), [
    "order_id",
    "credit",
  ]);
  show(
    "not carried, and short of stock",
    await call("create_order", {
      phone: MAMA_CHI,
      items: [
        { query: "star beer", qty: 5 },
        { query: "casera", qty: 100 },
      ],
    }),
    ["error", "unfilled", "next_step"],
  );
  show(
    "partly fillable order is explicit about it",
    await call("create_order", {
      phone: MAMA_CHI,
      items: [
        { query: "eva", qty: 2 },
        { query: "casera", qty: 100 },
      ],
    }),
    ["order_id", "total", "total_covers", "all_items_filled", "unfilled"],
  );
  show("a thrown handler stays inside the envelope", await call("create_order", { phone: MAMA_CHI, items: [null] }), [
    "error",
    "unfilled",
    "message",
  ]);
  show("unknown order id", await call("get_order", { order_id: "EMM-9999" }), ["error", "next_step"]);
  show("get_order on a real one", await call("get_order", { order_id: good.order_id }), [
    "order_id",
    "status",
    "total",
    "slot_is_provisional",
  ]);

  console.log("\n============ 5. warehouse sheet ============");
  const sheetRes = await fetch(`${BASE}/sheet`, { headers });
  const { released } = (await sheetRes.json()) as { released: Data[] };
  for (const order of released) {
    console.log(
      `${order.order_id}  ${order.retailer.shop_name.padEnd(18)} ${String(order.total).padStart(8)}  ` +
        `${order.slot.day_name} ${order.slot.date}  ${order.credit.outcome}`,
    );
  }
};

run()
  .then(() => client.close())
  .catch((error: Error) => {
    console.error(`demo failed: ${error.message}`);
    process.exit(1);
  });
