import assert from "node:assert/strict";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import { describe, it } from "node:test";

import type { AgentPayRuntime } from "../runtime/agentpay-runtime.ts";
import { startAgentPayHttpServer } from "./http.ts";

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
});

function mcpEnv(): Record<string, string> {
  return {
    SUPABASE_URL: "https://agentpay.supabase.co",
    SUPABASE_SERVICE_ROLE_KEY: "service-role-key",
    XLAYER_RPC_URL: "https://rpc.xlayer.tech",
    EXECUTOR_PRIVATE_KEY: `0x${"1".repeat(64)}`,
  };
}

function createRuntime(): AgentPayRuntime {
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
  };
}
