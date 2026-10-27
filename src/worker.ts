import { zValidator } from "@hono/zod-validator";
import { honoLogger } from "@logtape/hono";
import { Hono } from "hono";
import { bodyLimit } from "hono/body-limit";
import { HTTPException } from "hono/http-exception";
import type * as z from "zod";
import { authorised, readConfig } from "./lib/config.ts";
import type { Config } from "./lib/config.ts";
import { logger } from "./lib/log.ts";
import { serveMcp } from "./mcp.ts";
import type { DepotStub } from "./mcp.ts";
import { createOrderInput, lookupAccountInput, orderRef, sendPaymentLinkInput, simulatorQuery } from "./schemas.ts";
import type { Reply } from "./types.ts";

export { Depot } from "./depot.ts";

const DEPOT = "emmaco-depot";

const log = logger("http");

type App = { Bindings: Env; Variables: { config: Config; depot: DepotStub } };

const json = (status: number, body: unknown) =>
  new Response(`${JSON.stringify(body, null, 2)}\n`, {
    status,
    headers: { "Content-Type": "application/json" },
  });

const html = (title: string, inner: string) =>
  new Response(
    `<!doctype html><meta charset="utf-8"><title>${title}</title>` +
      `<body style="font:16px/1.6 system-ui;max-width:34rem;margin:4rem auto;padding:0 1rem">${inner}</body>`,
    { headers: { "Content-Type": "text/html; charset=utf-8" } },
  );

const send = async (reply: Promise<Reply>) => {
  const { status, body } = await reply;
  if (status >= 400) log.info("request refused", { status, error: "error" in body ? body.error : undefined });
  return json(status, body);
};

const naira = (amount: number) => amount.toLocaleString("en-NG");

const invalid = (result: { success: true } | { success: false; error: z.core.$ZodError }) => {
  if (result.success) return;
  return json(400, {
    error: "bad_request",
    message: "the request does not match what this endpoint takes",
    next_step: "fix the fields listed in issues and try again",
    issues: result.error.issues.map((issue) => `${issue.path.join(".") || "body"}: ${issue.message}`),
  });
};

const app = new Hono<App>({ strict: false });

app.use(
  honoLogger({
    category: ["reorder-desk", "http"],
    format: "structured-common",
    completionLevel: (_, { status, error }) => (status >= 500 || error ? "error" : status >= 400 ? "warning" : "info"),
    context: {
      requestId: { headerNames: ["cf-ray", "x-request-id"] },
      include: ["requestId", "method", "path"],
    },
  }),
);

app.get("/health", (c) => {
  const config = readConfig(c.env);
  return json(config.ok ? 200 : 503, {
    ok: config.ok,
    business: "Emmaco Ventures Ltd",
    payment_mode: config.paymentMode,
    ...(config.ok ? {} : { misconfigured: config.problems }),
  });
});

app.use(async (c, next) => {
  const config = readConfig(c.env);
  if (!config.ok) {
    log.error("misconfigured", { problems: config.problems });
    return json(503, {
      error: "misconfigured",
      message: "this service is not configured to run",
      next_step: "fix the settings listed here, then try again",
      problems: config.problems,
    });
  }
  c.set("config", config);
  c.set("depot", c.env.DEPOT.getByName(DEPOT));
  await next();
});

app.on(["GET", "POST"], "/simulator/pay", zValidator("query", simulatorQuery, invalid), async (c) => {
  const url = new URL(c.req.url);
  if (!c.var.config.simulatorEnabled) {
    return json(404, { error: "no_such_endpoint", message: `nothing at ${url.pathname}` });
  }
  const { reference, amount } = c.req.valid("query");
  const pending = await c.var.depot.readIntent(reference);
  if (!pending) {
    return json(404, { error: "unknown_reference", message: "no payment intent with that reference" });
  }
  if (c.req.method === "GET") {
    return html(
      "Emmaco checkout",
      `<h1>Pay Emmaco Ventures</h1><p>Reference <code>${reference}</code>, ` +
        `amount ${naira(pending.amount)} naira.</p>` +
        `<form method="post" action="${url.pathname}${url.search}">` +
        `<button style="font:inherit;padding:.6rem 1.2rem">Pay now</button></form>` +
        `<p style="color:#666">Test checkout. Nothing is charged.</p>`,
    );
  }
  const settled = await c.var.depot.settleSimulated(reference, amount ?? null);
  if (!settled.ok) {
    return json(404, { error: settled.reason, message: "no payment intent with that reference" });
  }
  return html(
    "Payment received",
    `<h1>Payment received</h1><p>Reference <code>${reference}</code>, ` +
      `amount ${naira(settled.intent.amount_paid)} naira.</p>` +
      `<p>Go back to WhatsApp and tell Nkem you have paid.</p>`,
  );
});

app.use(async (c, next) => {
  if (!authorised(c.req.raw, c.var.config)) {
    return json(401, {
      error: "unauthorized",
      message: "missing or wrong api key",
      next_step: "send x-api-key, or Authorization: Bearer, with the shared secret",
    });
  }
  await next();
});

app.all("/mcp", (c) => serveMcp(c.req.raw, c.var.depot, c.var.config));

app.get("/catalogue", (c) => send(c.var.depot.listCatalogue()));

app.get("/sheet", (c) => send(c.var.depot.sheet()));

app.get("/retailers/lookup", zValidator("query", lookupAccountInput, invalid), (c) =>
  send(c.var.depot.lookupAccount(c.req.valid("query"))),
);

app.get("/orders/:order_id", (c) => send(c.var.depot.getOrder({ order_id: c.req.param("order_id") })));

app.post("/admin/reset", (c) => {
  if (!c.var.config.resetAllowed) {
    return json(404, { error: "no_such_endpoint", message: "reset is not available with a live key" });
  }
  return send(c.var.depot.reset());
});

app.use("*", (c, next) =>
  bodyLimit({
    maxSize: c.var.config.maxBodyBytes,
    onError: () => json(413, { error: "too_large", message: "that request body is too big" }),
  })(c, next),
);

app.post("/orders", zValidator("json", createOrderInput, invalid), (c) =>
  send(c.var.depot.createOrder(c.req.valid("json"))),
);

app.post("/payments/init", zValidator("json", sendPaymentLinkInput, invalid), (c) =>
  send(c.var.depot.sendPaymentLink(c.req.valid("json"), c.var.config)),
);

app.post("/payments/verify", zValidator("json", orderRef, invalid), (c) =>
  send(c.var.depot.confirmPayment(c.req.valid("json"), c.var.config)),
);

app.post("/orders/release", zValidator("json", orderRef, invalid), (c) =>
  send(c.var.depot.releaseOrder(c.req.valid("json"))),
);

app.notFound((c) =>
  json(404, {
    error: "no_such_endpoint",
    message: `nothing at ${new URL(c.req.url).pathname}`,
    next_step: "check the README for the endpoint list",
  }),
);

app.onError((error) => {
  if (error instanceof HTTPException && error.status === 400) {
    return json(400, { error: "bad_json", message: "the request body is not valid json" });
  }
  log.error("unhandled error", { error });
  return json(500, { error: "internal", message: "something went wrong on the depot side" });
});

export default app;
