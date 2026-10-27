import * as z from "zod";
import { logger } from "./lib/log.ts";

const log = logger("input");

const UNIT_WORDS = /\b(crates?|cases?|cartons?|packs?|bags?|pcs|pieces?|units?|of)\b/gi;

const tidy = (text: string) => text.replace(UNIT_WORDS, " ").replace(/\s+/g, " ").trim();

// The minimums are advertised to the model but not enforced here, so createOrder can
// report an empty item or a zero quantity on that line instead of failing the whole order.
const line = z.strictObject({
  item: z.string().meta({
    minLength: 1,
    description: "The product as the retailer wrote it, such as 'coke', 'eva' or 'malt'",
  }),
  qty: z.int().meta({
    minimum: 1,
    description: "How many crates, cases or cartons, as a whole number such as 15",
  }),
});

type Line = z.output<typeof line>;

const coerce = (entry: unknown): Line => {
  if (typeof entry === "string") {
    const match = entry.trim().match(/^(\d+)\s*(.*)$/);
    if (!match) return { item: entry.trim(), qty: 0 };
    return { item: tidy(match[2]), qty: Number(match[1]) };
  }
  if (!entry || typeof entry !== "object") return { item: "", qty: 0 };
  const fields = entry as Record<string, unknown>;
  const text = fields.item ?? fields.name ?? fields.query ?? fields.sku ?? fields.product ?? fields.description ?? "";
  const digits = String(fields.qty ?? fields.quantity ?? fields.count ?? "").match(/\d+/)?.[0];
  return { item: tidy(String(text)), qty: digits ? Number(digits) : 0 };
};

const readLine = (entry: unknown): Line => {
  const exact = line.safeParse(entry);
  if (exact.success) return { ...exact.data, item: tidy(exact.data.item) };
  const coerced = coerce(entry);
  log.info("order line coerced", { received: entry, coerced });
  return coerced;
};

const phone = z.coerce.string().describe("The retailer's phone number in any format");
const orderId = z.string().describe("An order id such as EMM-0004");

export const orderLine = z.preprocess(readLine, line);

export const lookupAccountInput = z.object({ phone });

export const createOrderInput = z.object({
  phone,
  items: z
    .array(orderLine)
    .describe(
      'One entry per item, for example [{"item": "coke", "qty": 15}, {"item": "indomie", "qty": 3}]. ' +
        "Use the retailer's own word for the product; the tool matches it to the price list.",
    ),
});

export const orderRef = z.object({ order_id: orderId });

export const sendPaymentLinkInput = z.object({
  order_id: orderId,
  include_balance: z
    .boolean()
    .optional()
    .describe("True to add the shop's outstanding balance to the amount due"),
});

export const simulatorQuery = z.object({
  reference: z.string().default(""),
  amount: z.coerce.number().int().nonnegative().optional(),
});

export type OrderLine = z.output<typeof orderLine>;
export type CreateOrderInput = z.output<typeof createOrderInput>;
export type SendPaymentLinkInput = z.output<typeof sendPaymentLinkInput>;
