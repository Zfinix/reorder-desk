import { DurableObject } from "cloudflare:workers";
import { seed } from "./data/seed.ts";
import { catalogue, resolveItem } from "./lib/catalog.ts";
import type { Config } from "./lib/config.ts";
import { decideCredit } from "./lib/credit.ts";
import { deliveryFee, nextSlot } from "./lib/delivery.ts";
import { logger } from "./lib/log.ts";
import { initialize, verify } from "./lib/paystack.ts";
import type { CreateOrderInput, SendPaymentLinkInput } from "./schemas.ts";
import type {
  Intent,
  Line,
  Order,
  PriceItem,
  Problem,
  Reply,
  Retailer,
} from "./types.ts";

const log = logger("depot");

type State = {
  retailers: Retailer[];
  priceList: PriceItem[];
  orders: Record<string, Order>;
  refs: Record<string, string>;
  intents: Record<string, Intent>;
  seq: number;
};

const ok = (body: object): Reply => ({ status: 200, body });
const err = (
  status: number,
  error: string,
  message: string,
  next_step: string,
  extra: object = {},
): Reply => ({
  status,
  body: { error, message, next_step, ...extra },
});

const unknownRetailer = () =>
  err(
    404,
    "unknown_retailer",
    "that number is not on the Emmaco account list",
    "ask for the shop name and address so the depot can open an account, and do not take an order",
  );

const unknownOrder = () =>
  err(
    404,
    "unknown_order",
    "that order id is not on file",
    "call create_order to start a new order",
  );

const noPaymentStarted = () =>
  err(409, "no_payment_started", "no payment link has been sent for that order", "call send_payment_link first");

const DEFAULT_DIALLING_CODE = "234";

const normalisePhone = (phone: string) => {
  let digits = phone.replace(/\D/g, "");
  if (digits.startsWith("00")) digits = digits.slice(2);
  if (digits.startsWith("0")) digits = DEFAULT_DIALLING_CODE + digits.slice(1);
  if (digits.length === 10) digits = DEFAULT_DIALLING_CODE + digits;
  return digits;
};

const publicOrder = (order: Order) => ({
  order_id: order.order_id,
  status: order.status,
  retailer: {
    shop_name: order.retailer.shop_name,
    contact: order.retailer.contact,
    area: order.retailer.area,
  },
  lines: order.lines,
  unfilled: order.problems,
  all_items_filled: order.problems.length === 0,
  subtotal: order.subtotal,
  delivery_fee: order.delivery_fee,
  total: order.total,
  total_covers: "only the lines listed above, not the unfilled ones",
  account: order.account,
  credit: order.credit,
  slot: order.slot,
  slot_is_provisional: order.status !== "released",
  payment: order.payment
    ? {
        reference: order.payment.reference,
        amount_due: order.payment.amount_due,
        covers_old_balance: order.payment.covers_old_balance,
        checkout_url: order.payment.checkout_url,
        payment_confirmed: order.payment.verified === true,
      }
    : null,
});

export class Depot extends DurableObject<Env> {
  constructor(ctx: DurableObjectState, env: Env) {
    super(ctx, env);
    ctx.blockConcurrencyWhile(async () => {
      if ((await ctx.storage.get("seeded")) !== true) await this.#plant();
    });
  }

  async #plant() {
    await this.ctx.storage.put({
      retailers: structuredClone(seed.retailers),
      priceList: structuredClone(seed.priceList),
      orders: {},
      refs: {},
      intents: {},
      seq: 0,
      seeded: true,
    });
    log.info("depot seeded");
  }

  async reset(): Promise<Reply> {
    log.warn("depot reset");
    await this.ctx.storage.deleteAll();
    await this.#plant();
    return ok({ reset: true });
  }

  async #load(): Promise<State> {
    const [retailers, priceList, orders, refs, intents, seq] =
      await Promise.all([
        this.ctx.storage.get<Retailer[]>("retailers"),
        this.ctx.storage.get<PriceItem[]>("priceList"),
        this.ctx.storage.get<State["orders"]>("orders"),
        this.ctx.storage.get<State["refs"]>("refs"),
        this.ctx.storage.get<State["intents"]>("intents"),
        this.ctx.storage.get<number>("seq"),
      ]);
    return {
      retailers: retailers ?? [],
      priceList: priceList ?? [],
      orders: orders ?? {},
      refs: refs ?? {},
      intents: intents ?? {},
      seq: seq ?? 0,
    };
  }

  #retailer(state: State, phone: string) {
    const wanted = normalisePhone(phone);
    return (
      state.retailers.find((r) => normalisePhone(r.phone) === wanted) ?? null
    );
  }

  #committed(state: State, phone: string) {
    const wanted = normalisePhone(phone);
    return Object.values(state.orders)
      .filter(
        (order) =>
          normalisePhone(order.retailer.phone) === wanted &&
          order.credit.outcome === "approved_on_terms" &&
          order.status !== "released",
      )
      .reduce((sum, order) => sum + order.total, 0);
  }

  async listCatalogue(): Promise<Reply> {
    const state = await this.#load();
    return ok({ items: catalogue(state.priceList) });
  }

  async lookupAccount({ phone }: { phone: string }): Promise<Reply> {
    const state = await this.#load();
    const retailer = this.#retailer(state, phone);
    if (!retailer) return unknownRetailer();
    const committed = this.#committed(state, retailer.phone);
    return ok({
      shop_name: retailer.shop_name,
      contact: retailer.contact,
      area: retailer.area,
      credit_limit: retailer.credit_limit,
      balance: retailer.balance,
      unreleased_orders_on_terms: committed,
      credit_headroom: retailer.credit_limit - retailer.balance - committed,
      oldest_invoice_days: retailer.oldest_invoice_days,
      overdue: retailer.oldest_invoice_days > 30,
      account_status: retailer.status,
      credit_on_account: retailer.credit_on_account ?? 0,
    });
  }

  async getOrder({ order_id }: { order_id: string }): Promise<Reply> {
    const state = await this.#load();
    const order = state.orders[order_id];
    if (!order) return unknownOrder();
    return ok(publicOrder(order));
  }

  async sheet(): Promise<Reply> {
    const state = await this.#load();
    return ok({
      released: Object.values(state.orders)
        .filter((order) => order.status === "released")
        .map(publicOrder),
    });
  }

  async createOrder({ phone, items }: CreateOrderInput): Promise<Reply> {
    const state = await this.#load();
    const retailer = this.#retailer(state, phone);
    if (!retailer) return unknownRetailer();
    if (items.length === 0) {
      return err(
        400,
        "no_items",
        "no items on the order",
        "ask what they want to order",
      );
    }

    const lines: Line[] = [];
    const problems: Problem[] = [];
    for (const { item: query, qty } of items) {
      if (!query) {
        problems.push({
          item: null,
          problem: "no_item_named",
          expected: 'each entry should be {"item": "coke", "qty": 15}',
        });
        continue;
      }
      if (qty < 1) {
        problems.push({
          item: query,
          problem: "no_quantity",
          expected:
            'how many, as a whole number, like {"item": "coke", "qty": 15}',
        });
        continue;
      }
      const resolved = resolveItem(state.priceList, query);
      if (!resolved.ok) {
        problems.push(
          resolved.reason === "ambiguous"
            ? {
                item: query,
                problem: resolved.reason,
                candidates: resolved.candidates,
              }
            : { item: query, problem: resolved.reason },
        );
        continue;
      }
      if (qty > resolved.item.stock_cases) {
        problems.push({
          item: query,
          problem: "not_enough_stock",
          name: resolved.item.name,
          available: resolved.item.stock_cases,
        });
        continue;
      }
      lines.push({
        sku: resolved.item.sku,
        name: resolved.item.name,
        pack: resolved.item.pack,
        qty,
        unit_price: resolved.item.unit_price,
        line_total: resolved.item.unit_price * qty,
      });
    }

    if (lines.length === 0) {
      return err(
        422,
        "nothing_orderable",
        "none of those items could be put on an order",
        "tell the retailer exactly which item is the problem and what is available instead",
        { unfilled: problems },
      );
    }

    const slot = nextSlot(seed.routes, retailer.area);
    if (!slot.ok) {
      return err(
        409,
        "no_route_for_area",
        `no delivery route covers ${retailer.area}`,
        "tell the retailer the depot will call to arrange delivery",
      );
    }

    const fingerprint = lines
      .map((line) => `${line.sku}x${line.qty}`)
      .sort()
      .join("|");
    const duplicate = Object.values(state.orders).find(
      (order) =>
        order.status !== "released" &&
        order.fingerprint === fingerprint &&
        normalisePhone(order.retailer.phone) === normalisePhone(retailer.phone),
    );
    if (duplicate) {
      log.info("duplicate order returned", { order_id: duplicate.order_id });
      return ok({
        ...publicOrder(duplicate),
        already_on_file: true,
        note: "this exact order is already open for this shop, so it was not created twice",
      });
    }

    const subtotal = lines.reduce((sum, line) => sum + line.line_total, 0);
    const delivery_fee = deliveryFee(subtotal);
    const total = subtotal + delivery_fee;
    const committed = this.#committed(state, retailer.phone);
    const credit = decideCredit(retailer, total, committed);
    const seq = state.seq + 1;

    const order: Order = {
      order_id: `EMM-${String(seq).padStart(4, "0")}`,
      created_at: new Date().toISOString(),
      retailer: {
        phone: retailer.phone,
        shop_name: retailer.shop_name,
        contact: retailer.contact,
        area: retailer.area,
      },
      lines,
      problems,
      fingerprint,
      subtotal,
      delivery_fee,
      total,
      account: {
        balance: retailer.balance,
        credit_limit: retailer.credit_limit,
        unreleased_orders_on_terms: committed,
        oldest_invoice_days: retailer.oldest_invoice_days,
        status: retailer.status,
      },
      credit,
      slot,
      status:
        credit.outcome === "approved_on_terms"
          ? "approved_on_terms"
          : "awaiting_payment",
      payment: null,
    };

    state.orders[order.order_id] = order;
    await this.ctx.storage.put({ orders: state.orders, seq });
    log.info("order created", {
      order_id: order.order_id,
      shop: order.retailer.shop_name,
      total,
      credit: credit.outcome,
      lines: lines.length,
      unfilled: problems.length,
    });
    return { status: 201, body: publicOrder(order) };
  }

  async sendPaymentLink(
    { order_id, include_balance }: SendPaymentLinkInput,
    config: Config,
  ): Promise<Reply> {
    const state = await this.#load();
    const order = state.orders[order_id];
    if (!order) return unknownOrder();
    if (order.status === "released") {
      return err(
        409,
        "already_released",
        "that order has already gone out",
        "no payment is needed",
      );
    }
    if (order.payment?.verified) {
      return err(
        409,
        "already_paid",
        "that order is already paid",
        "call release_order",
      );
    }
    if (order.payment) {
      return err(
        409,
        "link_already_sent",
        "this order already has a payment link waiting on it",
        "send the retailer this same link again and ask them to finish it, never a second link",
        {
          reference: order.payment.reference,
          amount_due: order.payment.amount_due,
          checkout_url: order.payment.checkout_url,
          covers_old_balance: order.payment.covers_old_balance,
        },
      );
    }

    const retailer = this.#retailer(state, order.retailer.phone);
    const withBalance = include_balance === true;
    const amount = order.total + (withBalance ? retailer!.balance : 0);
    const reference = `${order.order_id}-${order.created_at.replace(/\D/g, "").slice(8, 14)}`;

    order.payment = {
      reference,
      amount_due: amount,
      covers_old_balance: withBalance,
      checkout_url: null,
      verified: false,
      mode: config.paymentMode,
    };
    state.orders[order.order_id] = order;
    await this.ctx.storage.put("orders", state.orders);

    const result = await initialize(config, {
      reference,
      amount,
      email: `${normalisePhone(order.retailer.phone)}@emmaco.ng`,
      metadata: {
        order_id: order.order_id,
        shop: order.retailer.shop_name,
        include_balance: withBalance,
      },
    });

    if (!result.ok) {
      order.payment = null;
      state.orders[order.order_id] = order;
      await this.ctx.storage.put("orders", state.orders);
      log.warn("payment link failed", {
        order_id,
        reason: result.reason,
        detail: result.detail,
      });
      return err(
        502,
        result.reason,
        "the payment provider did not give back a link",
        "tell the retailer the payment line is slow and you will send the link shortly, then call this again",
        { detail: result.detail },
      );
    }

    order.payment.reference = result.reference;
    order.payment.checkout_url = result.checkout_url;
    state.orders[order.order_id] = order;
    const writes: Partial<State> = { orders: state.orders };
    if (result.simulated) {
      state.intents[result.reference] = {
        reference: result.reference,
        amount,
        status: "pending",
        amount_paid: 0,
      };
      writes.intents = state.intents;
    }
    await this.ctx.storage.put(writes);
    log.info("payment link sent", {
      order_id,
      reference: result.reference,
      amount_due: amount,
      covers_old_balance: withBalance,
      mode: config.paymentMode,
    });

    return ok({
      order_id: order.order_id,
      checkout_url: result.checkout_url,
      amount_due: amount,
      reference: result.reference,
      covers_old_balance: withBalance,
    });
  }

  async confirmPayment(
    { order_id }: { order_id: string },
    config: Config,
  ): Promise<Reply> {
    const before = await this.#load();
    const existing = before.orders[order_id];
    if (!existing) return unknownOrder();
    if (!existing.payment) return noPaymentStarted();
    if (existing.payment.verified) {
      return ok({
        order_id,
        payment_confirmed: true,
        already_confirmed: true,
        amount_paid: existing.payment.amount_paid,
        next_step:
          existing.status === "released"
            ? "already released, nothing to do"
            : "call release_order",
      });
    }

    const result = await verify(
      config,
      existing.payment.reference,
      before.intents[existing.payment.reference],
    );

    const state = await this.#load();
    const order = state.orders[order_id];
    const payment = order.payment;
    if (!payment) return noPaymentStarted();
    if (payment.verified) {
      return ok({
        order_id,
        payment_confirmed: true,
        already_confirmed: true,
        amount_paid: payment.amount_paid,
        next_step: "call release_order",
      });
    }

    if (!result.ok) {
      return err(
        502,
        result.reason,
        "could not reach the payment provider to check",
        "do not release the order, tell the retailer you are still checking and call this again shortly",
        { detail: result.detail },
      );
    }
    if (result.status !== "success") {
      return err(
        402,
        "not_paid",
        "no completed payment on that link yet",
        "ask the retailer to finish the payment on the link already sent, and tell them nothing is released until it clears",
        { provider_status: result.status, checkout_url: payment.checkout_url },
      );
    }
    if (result.amount_paid < payment.amount_due) {
      log.warn("payment short", {
        order_id,
        reference: result.reference,
        amount_due: payment.amount_due,
        amount_paid: result.amount_paid,
      });
      return err(
        402,
        "underpaid",
        "the amount paid is short of the amount due",
        "tell the retailer the exact shortfall and ask them to complete it on the same link, never send a second link",
        {
          amount_due: payment.amount_due,
          amount_paid: result.amount_paid,
          shortfall: payment.amount_due - result.amount_paid,
          checkout_url: payment.checkout_url,
        },
      );
    }

    const owner = state.refs[result.reference];
    if (owner && owner !== order_id) {
      log.error("payment reference reused", {
        order_id,
        reference: result.reference,
        belongs_to: owner,
      });
      return err(
        409,
        "reference_already_used",
        "that payment reference has already released a different order",
        "do not release anything, and tell the retailer the depot will call them about it",
        { reference: result.reference, belongs_to: owner },
      );
    }

    const retailer = this.#retailer(state, order.retailer.phone)!;
    const surplus = result.amount_paid - order.total;
    let appliedToBalance = 0;
    let keptOnAccount = 0;
    if (surplus > 0) {
      appliedToBalance = Math.min(surplus, retailer.balance);
      keptOnAccount = surplus - appliedToBalance;
      retailer.balance -= appliedToBalance;
      if (retailer.balance === 0) retailer.oldest_invoice_days = 0;
      retailer.credit_on_account =
        (retailer.credit_on_account ?? 0) + keptOnAccount;
    }

    payment.verified = true;
    payment.amount_paid = result.amount_paid;
    payment.channel = result.channel;
    order.status = "paid";
    state.refs[result.reference] = order_id;
    state.orders[order_id] = order;

    await this.ctx.storage.put({
      orders: state.orders,
      refs: state.refs,
      retailers: state.retailers,
    });
    log.info("payment confirmed", {
      order_id,
      reference: result.reference,
      amount_paid: result.amount_paid,
      applied_to_old_balance: appliedToBalance,
      kept_on_account: keptOnAccount,
    });

    return ok({
      order_id,
      payment_confirmed: true,
      amount_paid: result.amount_paid,
      applied_to_old_balance: appliedToBalance,
      kept_on_account: keptOnAccount,
      account_balance_now: retailer.balance,
      next_step: "call release_order",
    });
  }

  async releaseOrder({ order_id }: { order_id: string }): Promise<Reply> {
    const state = await this.#load();
    const order = state.orders[order_id];
    if (!order) return unknownOrder();
    if (order.status === "released") {
      return ok({
        order_id,
        status: "released",
        already_released: true,
        slot: order.slot,
      });
    }

    const paid = order.payment?.verified === true;
    const retailer = this.#retailer(state, order.retailer.phone)!;

    if (!paid) {
      if (order.credit.outcome !== "approved_on_terms") {
        return err(
          402,
          "not_payable",
          "this order has no approved credit and no confirmed payment",
          "call send_payment_link, then confirm_payment, before releasing",
        );
      }
      const committed = Math.max(
        0,
        this.#committed(state, retailer.phone) - order.total,
      );
      const recheck = decideCredit(retailer, order.total, committed);
      if (recheck.outcome !== "approved_on_terms") {
        order.credit = recheck;
        order.status = "awaiting_payment";
        state.orders[order_id] = order;
        await this.ctx.storage.put("orders", state.orders);
        log.warn("credit withdrawn at release", {
          order_id,
          outcome: recheck.outcome,
        });
        return err(
          409,
          "credit_withdrawn",
          "the account no longer clears the credit rules for this order",
          "explain the account position and call send_payment_link for this order instead",
          { credit: recheck },
        );
      }
    }

    const slot = nextSlot(seed.routes, order.retailer.area);
    if (!slot.ok) {
      return err(
        409,
        "no_route_for_area",
        "no route covers that area",
        "tell the retailer the depot will call to arrange",
      );
    }

    for (const line of order.lines) {
      const item = state.priceList.find((entry) => entry.sku === line.sku);
      if (item) item.stock_cases = Math.max(0, item.stock_cases - line.qty);
    }
    if (!paid) {
      retailer.balance += order.total;
      if (retailer.oldest_invoice_days === 0) retailer.oldest_invoice_days = 1;
    }

    order.status = "released";
    order.slot = slot;
    order.released_at = new Date().toISOString();
    state.orders[order_id] = order;

    await this.ctx.storage.put({
      orders: state.orders,
      priceList: state.priceList,
      retailers: state.retailers,
    });
    log.info("order released", {
      order_id,
      settlement: paid ? "paid_upfront" : "on_terms",
      total: order.total,
      delivery_day: `${slot.day_name} ${slot.date}`,
    });

    return ok({
      order_id,
      status: "released",
      slot,
      total: order.total,
      settlement: paid ? "paid_upfront" : "on_terms",
      delivery_day: `${slot.day_name} ${slot.date}`,
    });
  }

  async readIntent(reference: string) {
    const intents =
      (await this.ctx.storage.get<State["intents"]>("intents")) ?? {};
    return intents[reference] ?? null;
  }

  async settleSimulated(
    reference: string,
    amount: number | null,
  ): Promise<
    { ok: true; intent: Intent } | { ok: false; reason: "unknown_reference" }
  > {
    const intents =
      (await this.ctx.storage.get<State["intents"]>("intents")) ?? {};
    const intent = intents[reference];
    if (!intent) return { ok: false, reason: "unknown_reference" };
    intent.status = "paid";
    intent.amount_paid = amount ?? intent.amount;
    intents[reference] = intent;
    await this.ctx.storage.put("intents", intents);
    log.info("simulated payment settled", {
      reference,
      amount_paid: intent.amount_paid,
    });
    return { ok: true, intent };
  }
}
