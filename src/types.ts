import type { CreditDecision } from "./lib/credit.ts";
import type { Slot } from "./lib/delivery.ts";
import type { PaymentMode } from "./lib/config.ts";

export type PriceItem = {
  sku: string;
  name: string;
  aliases: string[];
  pack: string;
  unit_price: number;
  stock_cases: number;
};

export type Retailer = {
  phone: string;
  shop_name: string;
  contact: string;
  area: string;
  credit_limit: number;
  balance: number;
  oldest_invoice_days: number;
  status: "active" | "on_hold";
  credit_on_account?: number;
};

export type Route = {
  label: string;
  weekday: number;
  day_name: string;
  cutoff_hour: number;
};

export type Seed = {
  priceList: PriceItem[];
  retailers: Retailer[];
  routes: Record<string, Route>;
};

export type Line = {
  sku: string;
  name: string;
  pack: string;
  qty: number;
  unit_price: number;
  line_total: number;
};

export type Problem =
  | { item: null; problem: "no_item_named"; expected: string }
  | { item: string; problem: "no_quantity"; expected: string }
  | { item: string; problem: "not_in_price_list" }
  | { item: string; problem: "ambiguous"; candidates: string[] }
  | { item: string; problem: "not_enough_stock"; name: string; available: number };

export type Payment = {
  reference: string;
  amount_due: number;
  covers_old_balance: boolean;
  checkout_url: string | null;
  verified: boolean;
  mode: PaymentMode;
  amount_paid?: number;
  channel?: string;
};

export type OrderStatus = "approved_on_terms" | "awaiting_payment" | "paid" | "released";

export type Order = {
  order_id: string;
  created_at: string;
  retailer: Pick<Retailer, "phone" | "shop_name" | "contact" | "area">;
  lines: Line[];
  problems: Problem[];
  fingerprint: string;
  subtotal: number;
  delivery_fee: number;
  total: number;
  account: Pick<Retailer, "balance" | "credit_limit" | "oldest_invoice_days" | "status"> & {
    unreleased_orders_on_terms: number;
  };
  credit: CreditDecision;
  slot: Slot;
  status: OrderStatus;
  payment: Payment | null;
  released_at?: string;
};

export type Intent = {
  reference: string;
  amount: number;
  status: "pending" | "paid";
  amount_paid: number;
};

export type Reply = { status: number; body: object };
