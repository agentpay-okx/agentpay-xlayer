import {
  checkWalletCreationInputSchema,
  checkRouteTargetAllowanceInputSchema,
  executePaymentInputSchema,
  getBalanceInputSchema,
  getAgentWalletInputSchema,
  listPaymentEventsInputSchema,
  listTransactionsInputSchema,
  parseInvoicePaymentInputSchema,
  parseX402PaymentRequiredInputSchema,
  prepareX402ServiceRequestInputSchema,
  prepareAccountAdminTransactionInputSchema,
  prepareContractCallInputSchema,
  preparePaymentInputSchema,
  prepareRouteTargetAllowanceInputSchema,
  prepareWalletCreationInputSchema,
  quotePaymentRouteInputSchema,
  retryX402RequestInputSchema,
  searchX402ServicesInputSchema,
  trackPaymentInputSchema,
} from "@agentpay-ai/shared";

import type { AgentPayRuntime } from "../runtime/agentpay-runtime.ts";
import { prepareAccountAdminTransactionTool } from "../tools/account-admin.ts";
import { executePaymentTool } from "../tools/execute-payment.ts";
import { getBalanceTool } from "../tools/get-balance.ts";
import { parseInvoicePaymentTool } from "../tools/invoice.ts";
import { prepareX402ServiceRequestTool, searchX402ServicesTool } from "../tools/x402-bazaar.ts";
import { parseX402PaymentRequiredTool, retryX402RequestTool } from "../tools/x402.ts";
import { listPaymentEventsTool, listTransactionsTool, trackPaymentTool } from "../tools/payment-tracking.ts";
import { prepareContractCallTool } from "../tools/prepare-contract-call.ts";
import { preparePaymentTool } from "../tools/prepare-payment.ts";
import { quotePaymentRouteTool } from "../tools/quote-payment-route.ts";
import {
  checkRouteTargetAllowanceTool,
  prepareRouteTargetAllowanceTool,
} from "../tools/route-target-allowance.ts";
import {
  checkWalletCreationTool,
  getAgentWalletTool,
  prepareWalletCreationTool,
} from "../tools/wallet-setup.ts";

export interface AgentPayMcpServer {
  registerTool(
    name: string,
    metadata: Record<string, unknown>,
    handler: (input: unknown) => Promise<AgentPayMcpToolResult>,
  ): void;
}

export interface AgentPayMcpToolResult {
  content: Array<{ type: "text"; text: string }>;
  structuredContent?: unknown;
  isError?: boolean;
}

export function registerAgentPayMcpTools(server: AgentPayMcpServer, runtime: AgentPayRuntime): void {
  server.registerTool(
    prepareWalletCreationTool.name,
    {
      title: "Prepare Wallet Creation",
      description: prepareWalletCreationTool.description,
      inputSchema: prepareWalletCreationInputSchema.shape,
    },
    async (input) => toMcpResult(await runtime.prepareWalletCreation(prepareWalletCreationInputSchema.parse(input))),
  );

  server.registerTool(
    checkWalletCreationTool.name,
    {
      title: "Check Wallet Creation",
      description: checkWalletCreationTool.description,
      inputSchema: checkWalletCreationInputSchema.shape,
    },
    async (input) => toMcpResult(await runtime.checkWalletCreation(checkWalletCreationInputSchema.parse(input))),
  );

  server.registerTool(
    getAgentWalletTool.name,
    {
      title: "Get Agent Wallet",
      description: getAgentWalletTool.description,
      inputSchema: getAgentWalletInputSchema.shape,
    },
    async (input) => toMcpResult(await runtime.getAgentWallet(getAgentWalletInputSchema.parse(input))),
  );

  server.registerTool(
    getBalanceTool.name,
    {
      title: "Get Balance",
      description: getBalanceTool.description,
      inputSchema: getBalanceInputSchema.shape,
    },
    async (input) => toMcpResult(await runtime.getBalance(getBalanceInputSchema.parse(input))),
  );

  server.registerTool(
    parseInvoicePaymentTool.name,
    {
      title: "Parse Invoice Payment",
      description: parseInvoicePaymentTool.description,
      inputSchema: parseInvoicePaymentInputSchema.shape,
    },
    async (input) => toMcpResult(await runtime.parseInvoicePayment(parseInvoicePaymentInputSchema.parse(input))),
  );

  server.registerTool(
    searchX402ServicesTool.name,
    {
      title: "Search x402 Services",
      description: searchX402ServicesTool.description,
      inputSchema: searchX402ServicesTool.inputSchema,
    },
    async (input) => toMcpResult(await runtime.searchX402Services(searchX402ServicesInputSchema.parse(input))),
  );

  server.registerTool(
    prepareX402ServiceRequestTool.name,
    {
      title: "Prepare x402 Service Request",
      description: prepareX402ServiceRequestTool.description,
      inputSchema: prepareX402ServiceRequestTool.inputSchema,
    },
    async (input) =>
      toMcpResult(await runtime.prepareX402ServiceRequest(prepareX402ServiceRequestInputSchema.parse(input))),
  );

  server.registerTool(
    parseX402PaymentRequiredTool.name,
    {
      title: "Parse x402 Payment Required",
      description: parseX402PaymentRequiredTool.description,
      inputSchema: parseX402PaymentRequiredTool.inputSchema,
    },
    async (input) =>
      toMcpResult(await runtime.parseX402PaymentRequired(parseX402PaymentRequiredInputSchema.parse(input))),
  );

  server.registerTool(
    retryX402RequestTool.name,
    {
      title: "Retry x402 Request",
      description: retryX402RequestTool.description,
      inputSchema: retryX402RequestTool.inputSchema,
    },
    async (input) => toMcpResult(await runtime.retryX402Request(retryX402RequestInputSchema.parse(input))),
  );

  server.registerTool(
    prepareContractCallTool.name,
    {
      title: "Prepare Contract Call",
      description: prepareContractCallTool.description,
      inputSchema: prepareContractCallTool.inputSchema,
    },
    async (input) => toMcpResult(await runtime.prepareContractCall(prepareContractCallInputSchema.parse(input))),
  );

  server.registerTool(
    quotePaymentRouteTool.name,
    {
      title: "Quote Payment Route",
      description: quotePaymentRouteTool.description,
      inputSchema: quotePaymentRouteInputSchema.shape,
    },
    async (input) => toMcpResult(await runtime.quotePaymentRoute(quotePaymentRouteInputSchema.parse(input))),
  );

  server.registerTool(
    checkRouteTargetAllowanceTool.name,
    {
      title: "Check Route Target Allowance",
      description: checkRouteTargetAllowanceTool.description,
      inputSchema: checkRouteTargetAllowanceInputSchema.shape,
    },
    async (input) =>
      toMcpResult(await runtime.checkRouteTargetAllowance(checkRouteTargetAllowanceInputSchema.parse(input))),
  );

  server.registerTool(
    prepareRouteTargetAllowanceTool.name,
    {
      title: "Prepare Route Target Allowance",
      description: prepareRouteTargetAllowanceTool.description,
      inputSchema: prepareRouteTargetAllowanceInputSchema.shape,
    },
    async (input) =>
      toMcpResult(await runtime.prepareRouteTargetAllowance(prepareRouteTargetAllowanceInputSchema.parse(input))),
  );

  server.registerTool(
    prepareAccountAdminTransactionTool.name,
    {
      title: "Prepare Account Admin Transaction",
      description: prepareAccountAdminTransactionTool.description,
      inputSchema: prepareAccountAdminTransactionTool.inputSchema,
    },
    async (input) =>
      toMcpResult(
        await runtime.prepareAccountAdminTransaction(prepareAccountAdminTransactionInputSchema.parse(input)),
      ),
  );

  server.registerTool(
    preparePaymentTool.name,
    {
      title: "Prepare Payment",
      description: preparePaymentTool.description,
      inputSchema: preparePaymentInputSchema.shape,
    },
    async (input) => toMcpResult(await runtime.preparePayment(preparePaymentInputSchema.parse(input))),
  );

  server.registerTool(
    executePaymentTool.name,
    {
      title: "Execute Payment",
      description: executePaymentTool.description,
      inputSchema: executePaymentInputSchema.shape,
    },
    async (input) => {
      try {
        return toMcpResult(await runtime.executePayment(executePaymentInputSchema.parse(input)));
      } catch (error) {
        return toMcpErrorResult(error);
      }
    },
  );

  server.registerTool(
    trackPaymentTool.name,
    {
      title: "Track Payment",
      description: trackPaymentTool.description,
      inputSchema: trackPaymentInputSchema.shape,
    },
    async (input) => toMcpResult(await runtime.trackPayment(trackPaymentInputSchema.parse(input))),
  );

  server.registerTool(
    listTransactionsTool.name,
    {
      title: "List Transactions",
      description: listTransactionsTool.description,
      inputSchema: listTransactionsInputSchema.shape,
    },
    async (input) => toMcpResult(await runtime.listTransactions(listTransactionsInputSchema.parse(input))),
  );

  server.registerTool(
    listPaymentEventsTool.name,
    {
      title: "List Payment Events",
      description: listPaymentEventsTool.description,
      inputSchema: listPaymentEventsInputSchema.shape,
    },
    async (input) => toMcpResult(await runtime.listPaymentEvents(listPaymentEventsInputSchema.parse(input))),
  );
}

function toMcpResult(output: unknown): AgentPayMcpToolResult {
  return {
    content: [
      {
        type: "text",
        text: JSON.stringify(output, null, 2),
      },
    ],
    structuredContent: output,
  };
}

function toMcpErrorResult(error: unknown): AgentPayMcpToolResult {
  return {
    content: [
      {
        type: "text",
        text: error instanceof Error ? error.message : "Unknown AgentPay tool failure.",
      },
    ],
    isError: true,
  };
}
