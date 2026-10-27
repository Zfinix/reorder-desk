const flag = (value: string | undefined) => value === "1" || value === "true";

export type PaymentMode = "paystack_test" | "simulated";

export type Config = {
  ok: boolean;
  problems: string[];
  baseUrl: string;
  apiKey: string;
  paystackKey: string;
  paymentMode: PaymentMode;
  simulatorEnabled: boolean;
  resetAllowed: boolean;
  maxBodyBytes: number;
};

type Settings = Partial<
  Record<"PAYSTACK_SECRET_KEY" | "REORDER_DESK_SIMULATE_PAYMENTS" | "PUBLIC_BASE_URL" | "REORDER_DESK_KEY", string>
>;

export const readConfig = (env: Settings): Config => {
  const problems: string[] = [];

  const paystackKey = (env.PAYSTACK_SECRET_KEY ?? "").trim();
  const livePayments = paystackKey.startsWith("sk_");
  const simulateAsked = flag(env.REORDER_DESK_SIMULATE_PAYMENTS);
  if (!livePayments && !simulateAsked) {
    problems.push(
      "PAYSTACK_SECRET_KEY is missing or does not start with sk_. " +
        "Set a Paystack test key, or REORDER_DESK_SIMULATE_PAYMENTS=1 to run the fake provider.",
    );
  }

  const baseUrl = (env.PUBLIC_BASE_URL ?? "").trim().replace(/\/+$/, "");
  if (!baseUrl) {
    problems.push("PUBLIC_BASE_URL is not set. Payment links are built from it.");
  } else if (!/^https?:\/\/[^\s/]+/.test(baseUrl)) {
    problems.push(`PUBLIC_BASE_URL is not an absolute url: ${baseUrl}`);
  }

  const apiKey = (env.REORDER_DESK_KEY ?? "").trim();
  if (!apiKey) {
    problems.push("REORDER_DESK_KEY is not set, and this endpoint has to be publicly reachable.");
  }

  return {
    ok: problems.length === 0,
    problems,
    baseUrl,
    apiKey,
    paystackKey,
    paymentMode: livePayments ? "paystack_test" : "simulated",
    simulatorEnabled: !livePayments && simulateAsked,
    resetAllowed: !paystackKey.startsWith("sk_live_"),
    maxBodyBytes: 256 * 1024,
  };
};

export const authorised = (request: Request, config: Config) =>
  request.headers.get("x-api-key") === config.apiKey ||
  request.headers.get("authorization") === `Bearer ${config.apiKey}`;
