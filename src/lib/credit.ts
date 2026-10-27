import type { Retailer } from "../types.ts";

const TERMS_DAYS = 14;
const OVERDUE_AFTER_DAYS = 30;

export type CreditDecision =
  | {
      outcome: "cash_required";
      reason: "account_on_hold";
      explain: string;
      amount_payable_now: number;
    }
  | {
      outcome: "cash_required";
      reason: "invoice_overdue";
      explain: string;
      amount_payable_now: number;
      outstanding_balance: number;
      amount_to_clear_everything: number;
      days_overdue: number;
    }
  | {
      outcome: "cash_required";
      reason: "over_credit_limit";
      explain: string;
      amount_payable_now: number;
      credit_headroom: number;
      note: string;
    }
  | {
      outcome: "approved_on_terms";
      reason: "within_limit_and_current";
      explain: string;
      terms_days: number;
      credit_headroom_after: number;
    };

export const decideCredit = (retailer: Retailer, orderTotal: number, committed = 0): CreditDecision => {
  if (retailer.status === "on_hold") {
    return {
      outcome: "cash_required",
      reason: "account_on_hold",
      explain: "the depot has this account on hold",
      amount_payable_now: orderTotal,
    };
  }
  if (retailer.oldest_invoice_days > OVERDUE_AFTER_DAYS) {
    return {
      outcome: "cash_required",
      reason: "invoice_overdue",
      explain: `the oldest unpaid invoice is ${retailer.oldest_invoice_days} days old, and the depot allows ${OVERDUE_AFTER_DAYS}`,
      amount_payable_now: orderTotal,
      outstanding_balance: retailer.balance,
      amount_to_clear_everything: orderTotal + retailer.balance,
      days_overdue: retailer.oldest_invoice_days,
    };
  }
  const headroom = retailer.credit_limit - retailer.balance - committed;
  if (orderTotal > headroom) {
    return {
      outcome: "cash_required",
      reason: "over_credit_limit",
      explain: `only ${Math.max(0, headroom)} of credit is left on the account and this order is ${orderTotal}`,
      amount_payable_now: orderTotal,
      credit_headroom: Math.max(0, headroom),
      note: "the whole order is payable now, the depot does not part-fund an order",
    };
  }
  return {
    outcome: "approved_on_terms",
    reason: "within_limit_and_current",
    explain: `payable in ${TERMS_DAYS} days`,
    terms_days: TERMS_DAYS,
    credit_headroom_after: headroom - orderTotal,
  };
};
