import * as z from "zod";
import type { Config } from "./config.ts";
import { logger } from "./log.ts";
import type { Intent } from "../types.ts";

const BASE = "https://api.paystack.co";
const TIMEOUT_MS = 8000;

const log = logger("paystack");

const rejection = z.object({ message: z.string().optional() });

const initialized = z.object({
  data: z.object({
    authorization_url: z.url(),
    reference: z.string().optional(),
  }),
});

const verified = z.object({
  data: z.object({
    status: z.string(),
    amount: z.number(),
    channel: z.string().nullish(),
    paid_at: z.string().nullish(),
    reference: z.string().optional(),
  }),
});

type Failure = { ok: false; reason: string; http?: number; detail?: string };

type Initialized = Failure | { ok: true; simulated: boolean; reference: string; checkout_url: string };

type Verified =
  | Failure
  | {
      ok: true;
      status: string;
      amount_paid: number;
      channel?: string;
      paid_at?: string | null;
      reference: string;
    };

const call = async (
  secret: string,
  path: string,
  init: RequestInit,
): Promise<Failure | { ok: true; body: unknown }> => {
  const start = Date.now();
  try {
    const res = await fetch(`${BASE}${path}`, {
      ...init,
      signal: AbortSignal.timeout(TIMEOUT_MS),
      headers: {
        Authorization: `Bearer ${secret}`,
        "Content-Type": "application/json",
        ...init?.headers,
      },
    });
    const body = await res.json().catch(() => ({}));
    const fields = { path, http: res.status, duration_ms: Date.now() - start };
    if (!res.ok) {
      const detail = rejection.safeParse(body).data?.message;
      log.warn("paystack rejected the call", { ...fields, detail });
      return { ok: false, reason: "provider_rejected", http: res.status, detail };
    }
    log.info("paystack call", fields);
    return { ok: true, body };
  } catch (error) {
    const { name, message } = error as Error;
    const reason = name === "TimeoutError" ? "provider_timeout" : "provider_unreachable";
    log.error("paystack unreachable", { path, reason, duration_ms: Date.now() - start, error });
    return { ok: false, reason, detail: message };
  }
};

export const initialize = async (
  config: Config,
  {
    reference,
    amount,
    email,
    metadata,
  }: { reference: string; amount: number; email: string; metadata: Record<string, unknown> },
): Promise<Initialized> => {
  if (config.paymentMode === "simulated") {
    return {
      ok: true,
      simulated: true,
      reference,
      checkout_url: `${config.baseUrl}/simulator/pay?reference=${reference}`,
    };
  }
  const result = await call(config.paystackKey, "/transaction/initialize", {
    method: "POST",
    body: JSON.stringify({ reference, amount: amount * 100, email, metadata }),
  });
  if (!result.ok) return result;
  const parsed = initialized.safeParse(result.body);
  if (!parsed.success) {
    return { ok: false, reason: "provider_rejected", detail: "no checkout url in the paystack response" };
  }
  const { data } = parsed.data;
  return {
    ok: true,
    simulated: false,
    reference: data.reference ?? reference,
    checkout_url: data.authorization_url,
  };
};

export const verify = async (config: Config, reference: string, intent: Intent | undefined): Promise<Verified> => {
  if (config.paymentMode === "simulated") {
    if (!intent) return { ok: false, reason: "unknown_reference" };
    return {
      ok: true,
      status: intent.status === "paid" ? "success" : "abandoned",
      amount_paid: intent.amount_paid,
      channel: "simulated",
      reference,
    };
  }
  const result = await call(config.paystackKey, `/transaction/verify/${encodeURIComponent(reference)}`, {
    method: "GET",
  });
  if (!result.ok) return result;
  const parsed = verified.safeParse(result.body);
  if (!parsed.success) {
    return { ok: false, reason: "provider_rejected", detail: "the paystack verify response was not the expected shape" };
  }
  const { data } = parsed.data;
  return {
    ok: true,
    status: data.status,
    amount_paid: Math.round(data.amount / 100),
    channel: data.channel ?? undefined,
    paid_at: data.paid_at,
    reference: data.reference ?? reference,
  };
};
