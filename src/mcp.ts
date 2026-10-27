import {
  createMcpHandler,
  isLegacyRequest,
  McpServer,
  WebStandardStreamableHTTPServerTransport,
} from "@modelcontextprotocol/server";
import type { CallToolResult } from "@modelcontextprotocol/server";
import * as z from "zod";
import type { Depot } from "./depot.ts";
import type { Config } from "./lib/config.ts";
import { logger } from "./lib/log.ts";
import { createOrderInput, lookupAccountInput, orderRef, sendPaymentLinkInput } from "./schemas.ts";
import type { Reply } from "./types.ts";

export type DepotStub = DurableObjectStub<Depot>;

const log = logger("mcp");

const text = (body: object, isError: boolean): CallToolResult => ({
  content: [{ type: "text", text: JSON.stringify(body, null, 2) }],
  isError,
});

const answer = async (name: string, run: () => Promise<Reply>) => {
  const start = Date.now();
  try {
    const { status, body } = await run();
    log.info("tool call", {
      tool: name,
      status,
      error: "error" in body ? body.error : undefined,
      duration_ms: Date.now() - start,
    });
    return text(body, status >= 400);
  } catch (error) {
    log.error("tool call threw", { tool: name, duration_ms: Date.now() - start, error });
    return text(
      {
        error: "tool_failed",
        message: "that call did not go through",
        next_step: "check the arguments and try again, and do not tell the retailer anything is confirmed",
      },
      true,
    );
  }
};

const buildServer = (depot: DepotStub, config: Config) => {
  const server = new McpServer(
    { name: "emmaco-reorder-desk", version: "2.0.0" },
    {
      instructions:
        "Tools for the Emmaco Ventures reorder desk: price orders, decide credit, take payment through Paystack, and release to the warehouse.",
    },
  );

  server.registerTool(
    "lookup_account",
    {
      description:
        "Read a retailer's Emmaco account by the number they are messaging from. Returns shop_name, area, credit_limit, balance, credit_headroom, oldest_invoice_days, overdue and account_status. Use this to answer any question about what a shop owes or whether it can buy on credit. It changes nothing, so prefer it over create_order when the retailer is only asking.",
      inputSchema: lookupAccountInput,
    },
    (args) => answer("lookup_account", () => depot.lookupAccount(args)),
  );

  server.registerTool(
    "get_price_list",
    {
      description:
        "The Emmaco price list: sku, name, pack, unit_price and in_stock for every product the depot carries. Quote prices and availability only from here, and never name a product that is not on this list.",
      inputSchema: z.object({}),
    },
    () => answer("get_price_list", () => depot.listCatalogue()),
  );

  server.registerTool(
    "create_order",
    {
      description:
        "Price an order and get the credit decision. Pass the items as the retailer wrote them. Returns lines (what could be filled), unfilled and all_items_filled (what could not, with the reason), total (which covers ONLY the filled lines), credit.outcome of approved_on_terms or cash_required with an explain string, and slot (the delivery day, provisional until release). Always read unfilled before replying, or you will confirm an order you cannot deliver. This reserves nothing and releases nothing.",
      inputSchema: createOrderInput,
    },
    (args) => answer("create_order", () => depot.createOrder(args)),
  );

  server.registerTool(
    "get_order",
    {
      description:
        "Read an order already on file by its id, including its credit decision, its payment state and whether it has been released. Use it when a retailer comes back to a conversation, so you do not create a second order for the same request.",
      inputSchema: orderRef,
    },
    (args) => answer("get_order", () => depot.getOrder(args)),
  );

  server.registerTool(
    "send_payment_link",
    {
      description:
        "Create one Paystack payment link for an order that cannot go out on credit. Returns checkout_url, amount_due and reference. Set include_balance true to put the shop's old outstanding balance on the same link, which is what returns an overdue account to terms. An order may only ever have ONE link: if one is already waiting this returns link_already_sent with that same checkout_url, and you send that one again rather than a new one.",
      inputSchema: sendPaymentLinkInput,
    },
    (args) => answer("send_payment_link", () => depot.sendPaymentLink(args, config)),
  );

  server.registerTool(
    "confirm_payment",
    {
      description:
        "Ask Paystack whether the link for this order has actually been paid. This is the only acceptable proof: a screenshot, a transfer alert or the retailer saying they have paid is not proof. Returns payment_confirmed true, or an error that is one of not_paid, underpaid with the exact shortfall, or reference_already_used. Safe to call more than once; once confirmed it keeps returning confirmed.",
      inputSchema: orderRef,
    },
    (args) => answer("confirm_payment", () => depot.confirmPayment(args, config)),
  );

  server.registerTool(
    "release_order",
    {
      description:
        "Release an order to the warehouse and book it onto the delivery route. Works only when the order is approved on credit or its payment is confirmed, and it rechecks the credit rules at this moment, so it can still refuse with credit_withdrawn. Returns delivery_day, which is the only delivery day you may tell the retailer is confirmed.",
      inputSchema: orderRef,
    },
    (args) => answer("release_order", () => depot.releaseOrder(args)),
  );

  return server;
};

export const serveMcp = async (raw: Request, depot: DepotStub, config: Config) => {
  if (raw.method !== "POST") {
    return Response.json(
      { jsonrpc: "2.0", id: null, error: { code: -32000, message: "Method not allowed, post json-rpc to /mcp" } },
      { status: 405, headers: { Allow: "POST" } },
    );
  }
  const request = new Request(raw);
  request.headers.set("Accept", "application/json, text/event-stream");
  const limits = { maxRequestBodySize: config.maxBodyBytes };

  if (!(await isLegacyRequest(request, undefined, limits))) {
    const modern = createMcpHandler(() => buildServer(depot, config), { legacy: "reject", responseMode: "json", ...limits });
    return modern.fetch(request);
  }

  const transport = new WebStandardStreamableHTTPServerTransport({ sessionIdGenerator: undefined, enableJsonResponse: true });
  await buildServer(depot, config).connect(transport);
  return transport.handleRequest(request);
};
