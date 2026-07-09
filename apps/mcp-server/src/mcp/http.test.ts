import assert from "node:assert/strict";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import type { PaymentPayload, PaymentRequirements } from "@okxweb3/x402-core/types";
import { describe, it } from "node:test";

import type { AgentPayRuntime } from "../runtime/agentpay-runtime.ts";
import type { AgentPayMcpPaymentProcessor } from "./okx-agent-payment.ts";
import { startAgentPayHttpServer } from "./http.ts";
import type { ConnectableAgentPayMcpServer } from "./stdio.ts";

describe("startAgentPayHttpServer", () => {
  it("serves health checks and MCP tools over Streamable HTTP", async () => {
    const server = await startAgentPayHttpServer({
      env: mcpEnv(),
      hostname: "127.0.0.1",
      port: 0,
      createRuntime() {
        return createRuntime();
      },
    });

    try {
      const health = await fetch(server.healthUrl);
      assert.equal(health.status, 200);
      assert.deepEqual(await health.json(), {
        ok: true,
        service: "agentpay-a2mcp",
        transport: "streamable-http",
      });

      const client = new Client({ name: "agentpay-http-test", version: "1.0.0" });
      const transport = new StreamableHTTPClientTransport(new URL(server.mcpUrl));

      await client.connect(transport);
      const tools = await client.listTools();
      await client.close();

      assert.ok(tools.tools.some((tool) => tool.name === "prepare_wallet_creation"));
      assert.ok(tools.tools.some((tool) => tool.name === "execute_payment"));
      assert.ok(tools.tools.some((tool) => tool.name === "search_x402_services"));
    } finally {
      await server.close();
    }
  });

  it("rejects non-POST MCP requests with a JSON-RPC error", async () => {
    const server = await startAgentPayHttpServer({
      env: mcpEnv(),
      hostname: "127.0.0.1",
      port: 0,
      createRuntime() {
        return createRuntime();
      },
    });

    try {
      const response = await fetch(server.mcpUrl);

      assert.equal(response.status, 405);
      assert.deepEqual(await response.json(), {
        jsonrpc: "2.0",
        error: {
          code: -32000,
          message: "Method not allowed.",
        },
        id: null,
      });
    } finally {
      await server.close();
    }
  });

  it("keeps health checks free when MCP payments are enabled", async () => {
    const paymentProcessor = createPaymentProcessor({
      async processHTTPRequest() {
        throw new Error("health checks should not touch the payment processor.");
      },
    });
    const server = await startAgentPayHttpServer({
      env: mcpEnv(),
      hostname: "127.0.0.1",
      port: 0,
      paymentProcessor,
      createRuntime() {
        return createRuntime();
      },
    });

    try {
      const response = await fetch(server.healthUrl);

      assert.equal(response.status, 200);
      assert.deepEqual(await response.json(), {
        ok: true,
        service: "agentpay-a2mcp",
        transport: "streamable-http",
      });
    } finally {
      await server.close();
    }
  });

  it("keeps MCP discovery free but charges MCP tool calls when payments are enabled", async () => {
    let paymentCalls = 0;
    let walletSetupWasCalled = false;
    const paymentProcessor = createPaymentProcessor({
      async processHTTPRequest(context) {
        paymentCalls += 1;
        assert.equal(context.method, "POST");
        assert.equal(context.path, "/mcp");

        return {
          type: "payment-error",
          response: {
            status: 402,
            headers: {
              "content-type": "application/json",
              "PAYMENT-REQUIRED": "tool-call-challenge",
            },
            body: {
              error: "Payment required.",
            },
          },
        };
      },
    });
    const server = await startAgentPayHttpServer({
      env: mcpEnv(),
      hostname: "127.0.0.1",
      port: 0,
      paymentProcessor,
      createRuntime() {
        return createRuntime({
          async prepareWalletCreation() {
            walletSetupWasCalled = true;
            return {
              status: "PENDING",
              setupIntentId: "setup_http",
              setupUrl: "https://setup.example.com/setup?setup_intent_id=setup_http",
              messageToSign: "AgentPay setup intent setup_http",
              expiresAt: "2026-07-08T00:15:00.000Z",
              homeChainId: 1952,
              homeChain: "X Layer testnet",
            };
          },
        });
      },
    });

    try {
      const client = new Client({ name: "agentpay-http-free-test", version: "1.0.0" });
      const transport = new StreamableHTTPClientTransport(new URL(server.mcpUrl));

      await client.connect(transport);
      const tools = await client.listTools();
      await client.close();

      const toolCallResponse = await fetch(server.mcpUrl, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          jsonrpc: "2.0",
          id: 1,
          method: "tools/call",
          params: {
            name: "prepare_wallet_creation",
            arguments: { network: "testnet" },
          },
        }),
      });

      assert.ok(tools.tools.some((tool) => tool.name === "prepare_wallet_creation"));
      assert.equal(toolCallResponse.status, 402);
      assert.equal(toolCallResponse.headers.get("PAYMENT-REQUIRED"), "tool-call-challenge");
      assert.deepEqual(await toolCallResponse.json(), { error: "Payment required." });
      assert.equal(paymentCalls, 1);
      assert.equal(walletSetupWasCalled, false);
    } finally {
      await server.close();
    }
  });

  it("returns an OKX Agent Payments Protocol challenge before serving protected MCP methods", async () => {
    let mcpServerWasCreated = false;
    const paymentProcessor = createPaymentProcessor({
      async processHTTPRequest(context) {
        assert.equal(context.method, "POST");
        assert.equal(context.path, "/mcp");
        assert.equal(context.paymentHeader, undefined);

        return {
          type: "payment-error",
          response: {
            status: 402,
            headers: {
              "content-type": "application/json",
              "PAYMENT-REQUIRED": Buffer.from(
                JSON.stringify({
                  x402Version: 2,
                  resource: {
                    url: "/mcp",
                    description: "AgentPay public MCP endpoint",
                  },
                  accepts: [
                    {
                      scheme: "exact",
                      network: "eip155:196",
                      asset: "0x0000000000000000000000000000000000000001",
                      amount: "10000",
                      payTo: "0x0000000000000000000000000000000000000002",
                      maxTimeoutSeconds: 300,
                      extra: {},
                    },
                  ],
                }),
              ).toString("base64"),
            },
            body: {
              error: "Payment required.",
            },
          },
        };
      },
    });
    const server = await startAgentPayHttpServer({
      env: mcpEnv(),
      hostname: "127.0.0.1",
      port: 0,
      paymentProcessor,
      createRuntime() {
        return createRuntime();
      },
      createServer(runtime) {
        mcpServerWasCreated = true;
        return createFakeMcpServer(runtime);
      },
    });

    try {
      const response = await fetch(server.mcpUrl, {
        method: "POST",
        headers: {
          "content-type": "application/json",
        },
        body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "resources/read", params: { uri: "paid://probe" } }),
      });

      assert.equal(response.status, 402);
      assert.equal((response.headers.get("PAYMENT-REQUIRED") ?? "").length > 0, true);
      assert.deepEqual(await response.json(), { error: "Payment required." });
      assert.equal(mcpServerWasCreated, false);
    } finally {
      await server.close();
    }
  });

  it("returns a payment challenge for generic endpoint probes when MCP payments are enabled", async () => {
    let mcpServerWasCreated = false;
    const paymentProcessor = createPaymentProcessor({
      async processHTTPRequest(context) {
        assert.equal(context.path, "/mcp");

        return {
          type: "payment-error",
          response: {
            status: 402,
            headers: {
              "content-type": "application/json",
              "PAYMENT-REQUIRED": "probe-challenge",
            },
            body: {
              error: "Payment required.",
            },
          },
        };
      },
    });
    const server = await startAgentPayHttpServer({
      env: mcpEnv(),
      hostname: "127.0.0.1",
      port: 0,
      paymentProcessor,
      createRuntime() {
        return createRuntime();
      },
      createServer(runtime) {
        mcpServerWasCreated = true;
        return createFakeMcpServer(runtime);
      },
    });

    try {
      const getResponse = await fetch(server.mcpUrl);
      const malformedPostResponse = await fetch(server.mcpUrl, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({}),
      });

      assert.equal(getResponse.status, 402);
      assert.equal(getResponse.headers.get("PAYMENT-REQUIRED"), "probe-challenge");
      assert.deepEqual(await getResponse.json(), { error: "Payment required." });
      assert.equal(malformedPostResponse.status, 402);
      assert.equal(malformedPostResponse.headers.get("PAYMENT-REQUIRED"), "probe-challenge");
      assert.equal(mcpServerWasCreated, false);
    } finally {
      await server.close();
    }
  });

  it("forwards paid MCP requests and settles after the MCP response", async () => {
    const calls: string[] = [];
    const paymentProcessor = createPaymentProcessor({
      async processHTTPRequest(context) {
        calls.push(`process:${context.paymentHeader}`);

        return {
          type: "payment-verified",
          paymentPayload: createPaymentPayload(),
          paymentRequirements: createPaymentRequirements(),
        };
      },
      async processSettlement(_payload, _requirements, _extensions, transportContext) {
        calls.push(`settle:${transportContext?.responseBody?.byteLength ?? 0}`);

        return {
          success: true,
          status: "success",
          transaction: "0xsettled",
          network: "eip155:196",
          headers: {
            "PAYMENT-RESPONSE": Buffer.from(JSON.stringify({ success: true, transaction: "0xsettled" })).toString(
              "base64",
            ),
          },
          requirements: createPaymentRequirements(),
        };
      },
    });
    const server = await startAgentPayHttpServer({
      env: mcpEnv(),
      hostname: "127.0.0.1",
      port: 0,
      paymentProcessor,
      createRuntime() {
        return createRuntime({
          async retryX402Request() {
            return {
              status: "RESOURCE_FETCHED",
              paymentIntentId: "pay_x402",
              requestUrl: "https://api.example.com/protected",
              method: "GET",
              httpStatus: 200,
              paymentHeader: "proof",
              bodyText: "paid payload",
              instructionToAgent: "x402 retry succeeded. Return the protected resource response to the user.",
            };
          },
        });
      },
    });

    try {
      const response = await fetch(server.mcpUrl, {
        method: "POST",
        headers: {
          accept: "application/json, text/event-stream",
          "content-type": "application/json",
          "PAYMENT-SIGNATURE": "paid",
        },
        body: JSON.stringify({
          jsonrpc: "2.0",
          id: 1,
          method: "tools/call",
          params: {
            name: "retry_x402_request",
            arguments: {
              paymentIntentId: "pay_x402",
              paymentRequired: {
                x402Version: 2,
                resource: {
                  url: "https://api.example.com/protected",
                  method: "GET",
                },
                accepts: [],
              },
            },
          },
        }),
      });
      const responseText = await response.text();

      assert.equal(response.status, 200);
      assert.equal((response.headers.get("PAYMENT-RESPONSE") ?? "").length > 0, true);
      assert.match(responseText, /paid payload/);
      assert.equal(calls[0], "process:paid");
      assert.match(calls[1] ?? "", /^settle:\d+$/);
    } finally {
      await server.close();
    }
  });
});

function mcpEnv(): Record<string, string> {
  return {
    SUPABASE_URL: "https://agentpay.supabase.co",
    SUPABASE_SERVICE_ROLE_KEY: "service-role-key",
    XLAYER_RPC_URL: "https://rpc.xlayer.tech",
    EXECUTOR_PRIVATE_KEY: `0x${"1".repeat(64)}`,
  };
}

function createRuntime(overrides: Partial<AgentPayRuntime> = {}): AgentPayRuntime {
  return {
    async prepareWalletCreation() {
      throw new Error("prepareWalletCreation was not expected.");
    },
    async checkWalletCreation() {
      throw new Error("checkWalletCreation was not expected.");
    },
    async getAgentWallet() {
      throw new Error("getAgentWallet was not expected.");
    },
    async getBalance() {
      throw new Error("getBalance was not expected.");
    },
    async parseInvoicePayment() {
      throw new Error("parseInvoicePayment was not expected.");
    },
    async searchX402Services() {
      throw new Error("searchX402Services was not expected.");
    },
    async prepareX402ServiceRequest() {
      throw new Error("prepareX402ServiceRequest was not expected.");
    },
    async parseX402PaymentRequired() {
      throw new Error("parseX402PaymentRequired was not expected.");
    },
    async retryX402Request() {
      throw new Error("retryX402Request was not expected.");
    },
    async prepareContractCall() {
      throw new Error("prepareContractCall was not expected.");
    },
    async quotePaymentRoute() {
      throw new Error("quotePaymentRoute was not expected.");
    },
    async checkRouteTargetAllowance() {
      throw new Error("checkRouteTargetAllowance was not expected.");
    },
    async prepareRouteTargetAllowance() {
      throw new Error("prepareRouteTargetAllowance was not expected.");
    },
    async prepareAccountAdminTransaction() {
      throw new Error("prepareAccountAdminTransaction was not expected.");
    },
    async preparePayment() {
      throw new Error("preparePayment was not expected.");
    },
    async executePayment() {
      throw new Error("executePayment was not expected.");
    },
    async trackPayment() {
      throw new Error("trackPayment was not expected.");
    },
    async listTransactions() {
      throw new Error("listTransactions was not expected.");
    },
    async listPaymentEvents() {
      throw new Error("listPaymentEvents was not expected.");
    },
    ...overrides,
  };
}

function createPaymentProcessor(overrides: Partial<AgentPayMcpPaymentProcessor>) {
  return {
    async processHTTPRequest() {
      return {
        type: "no-payment-required",
      } as const;
    },
    async processSettlement() {
      return {
        success: true,
        transaction: "0x0",
        network: "eip155:196",
        headers: {},
        requirements: createPaymentRequirements(),
      };
    },
    ...overrides,
  } satisfies AgentPayMcpPaymentProcessor;
}

function createPaymentRequirements(): PaymentRequirements {
  return {
    scheme: "exact",
    network: "eip155:196",
    asset: "0x0000000000000000000000000000000000000001",
    amount: "1",
    payTo: "0x0000000000000000000000000000000000000002",
    maxTimeoutSeconds: 300,
    extra: {},
  };
}

function createPaymentPayload(): PaymentPayload {
  return {
    x402Version: 2,
    accepted: createPaymentRequirements(),
    payload: {},
  };
}

function createFakeMcpServer(_runtime: AgentPayRuntime): ConnectableAgentPayMcpServer {
  return {
    registerTool() {},
    async connect() {},
    async close() {},
  } as unknown as ConnectableAgentPayMcpServer;
}
