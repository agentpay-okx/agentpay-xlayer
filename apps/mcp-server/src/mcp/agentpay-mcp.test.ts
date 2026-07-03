import assert from "node:assert/strict";
import { describe, it } from "node:test";

import type { AgentPayRuntime } from "../runtime/agentpay-runtime.ts";
import { registerAgentPayMcpTools, type AgentPayMcpServer } from "./agentpay-mcp.ts";

class FakeMcpServer implements AgentPayMcpServer {
  public tools = new Map<
    string,
    {
      metadata: Record<string, unknown>;
      handler: (input: unknown) => Promise<unknown>;
    }
  >();

  registerTool(name: string, metadata: Record<string, unknown>, handler: (input: unknown) => Promise<unknown>): void {
    this.tools.set(name, { metadata, handler });
  }
}

describe("registerAgentPayMcpTools", () => {
  it("registers wallet setup tools and returns structured setup content", async () => {
    const server = new FakeMcpServer();
    const runtime = createRuntime({
      async prepareWalletCreation(input) {
        assert.deepEqual(input, {});
        return {
          setupIntentId: "setup_runtime",
          status: "PENDING",
          setupUrl: "https://setup.agentpay.dev/setup?setup_intent_id=setup_runtime",
          messageToSign: "AgentPay wallet setup",
          expiresAt: "2026-07-03T04:15:00.000Z",
        };
      },
    });

    registerAgentPayMcpTools(server, runtime);

    assert.deepEqual([...server.tools.keys()], [
      "prepare_wallet_creation",
      "check_wallet_creation",
      "get_agent_wallet",
      "get_balance",
      "parse_invoice_payment",
      "parse_x402_payment_required",
      "prepare_contract_call",
      "quote_payment_route",
      "check_route_target_allowance",
      "prepare_route_target_allowance",
      "prepare_account_admin_transaction",
      "prepare_payment",
      "execute_payment",
      "track_payment",
      "list_transactions",
      "list_payment_events",
    ]);

    const registered = server.tools.get("prepare_wallet_creation");
    assert.ok(registered);
    assert.match(String(registered.metadata.description), /wallet setup intent/);

    const result = await registered.handler({});

    assert.deepEqual(result, {
      content: [
        {
          type: "text",
          text: JSON.stringify((result as { structuredContent: unknown }).structuredContent, null, 2),
        },
      ],
      structuredContent: {
        setupIntentId: "setup_runtime",
        status: "PENDING",
        setupUrl: "https://setup.agentpay.dev/setup?setup_intent_id=setup_runtime",
        messageToSign: "AgentPay wallet setup",
        expiresAt: "2026-07-03T04:15:00.000Z",
      },
    });
  });

  it("registers get_balance and returns structured balance content", async () => {
    const server = new FakeMcpServer();
    const balanceInputs: unknown[] = [];
    const runtime = createRuntime({
      async getBalance(input) {
        balanceInputs.push(input);
        return {
          status: "ACTIVE",
          accountAddress: "0x3333333333333333333333333333333333333333",
          ownerAddress: "0x2222222222222222222222222222222222222222",
          chainId: 56,
          chain: "BNB Chain",
          balances: [
            {
              tokenSymbol: "USDT",
              tokenAddress: "0x55d398326f99059fF775485246999027B3197955",
              amount: "12.5",
              decimals: 18,
            },
          ],
          nativeBalance: {
            tokenSymbol: "BNB",
            tokenAddress: "native",
            amount: "0.03",
            decimals: 18,
          },
        };
      },
    });

    registerAgentPayMcpTools(server, runtime);
    const registered = server.tools.get("get_balance");

    assert.ok(registered);
    assert.match(String(registered.metadata.description), /Read AgentPay wallet token balances/);

    const result = await registered.handler({ tokenSymbols: ["USDT"] });

    assert.deepEqual(balanceInputs, [{ tokenSymbols: ["USDT"] }]);
    assert.deepEqual(result, {
      content: [
        {
          type: "text",
          text: JSON.stringify((result as { structuredContent: unknown }).structuredContent, null, 2),
        },
      ],
      structuredContent: {
        status: "ACTIVE",
        accountAddress: "0x3333333333333333333333333333333333333333",
        ownerAddress: "0x2222222222222222222222222222222222222222",
        chainId: 56,
        chain: "BNB Chain",
        balances: [
          {
            tokenSymbol: "USDT",
            tokenAddress: "0x55d398326f99059fF775485246999027B3197955",
            amount: "12.5",
            decimals: 18,
          },
        ],
        nativeBalance: {
          tokenSymbol: "BNB",
          tokenAddress: "native",
          amount: "0.03",
          decimals: 18,
        },
      },
    });
  });

  it("registers parse_invoice_payment and returns normalized payment fields", async () => {
    const server = new FakeMcpServer();
    const invoiceInputs: unknown[] = [];
    const runtime = createRuntime({
      async parseInvoicePayment(input) {
        invoiceInputs.push(input);
        return {
          status: "PARSED",
          invoiceId: "inv_runtime",
          paymentInput: {
            recipientAddress: "0x1111111111111111111111111111111111111111",
            destinationChainId: 8453,
            destinationChain: "Base",
            destinationTokenSymbol: "USDC",
            amountOut: "10",
            purpose: "design bounty",
            sourceTokenSymbol: "USDT",
            paymentType: "INVOICE_PAYMENT",
          },
          instructionToAgent:
            "Review these invoice payment fields with the user, then call prepare_payment with paymentInput if they match the invoice.",
        };
      },
    });

    registerAgentPayMcpTools(server, runtime);
    const registered = server.tools.get("parse_invoice_payment");

    assert.ok(registered);
    assert.match(String(registered.metadata.description), /invoice/);

    const result = await registered.handler({
      invoice: [
        "Invoice ID: inv_runtime",
        "Recipient: 0x1111111111111111111111111111111111111111",
        "Destination Chain: Base",
        "Token: USDC",
        "Amount: 10",
        "Purpose: design bounty",
      ].join("\n"),
    });

    assert.equal(invoiceInputs.length, 1);
    assert.equal((invoiceInputs[0] as { sourceTokenSymbol: string }).sourceTokenSymbol, "USDT");
    assert.deepEqual((result as { structuredContent: unknown }).structuredContent, {
      status: "PARSED",
      invoiceId: "inv_runtime",
      paymentInput: {
        recipientAddress: "0x1111111111111111111111111111111111111111",
        destinationChainId: 8453,
        destinationChain: "Base",
        destinationTokenSymbol: "USDC",
        amountOut: "10",
        purpose: "design bounty",
        sourceTokenSymbol: "USDT",
        paymentType: "INVOICE_PAYMENT",
      },
      instructionToAgent:
        "Review these invoice payment fields with the user, then call prepare_payment with paymentInput if they match the invoice.",
    });
  });

  it("registers parse_x402_payment_required and returns normalized payment fields", async () => {
    const server = new FakeMcpServer();
    const x402Inputs: unknown[] = [];
    const runtime = createRuntime({
      async parseX402PaymentRequired(input) {
        x402Inputs.push(input);
        return {
          status: "PARSED",
          x402Version: 2,
          resource: {
            url: "https://api.example.com/premium-data",
            description: "Premium market data",
            serviceName: "Market API",
          },
          selectedRequirement: {
            scheme: "exact",
            network: "eip155:8453",
            chainId: 8453,
            chain: "Base",
            asset: "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913",
            tokenSymbol: "USDC",
            payTo: "0x1111111111111111111111111111111111111111",
            amountAtomic: "10000",
            amount: "0.01",
            maxTimeoutSeconds: 60,
          },
          paymentInput: {
            recipientAddress: "0x1111111111111111111111111111111111111111",
            destinationChainId: 8453,
            destinationChain: "Base",
            destinationTokenSymbol: "USDC",
            amountOut: "0.01",
            purpose: "x402 payment for Market API: Premium market data",
            sourceTokenSymbol: "USDT",
            paymentType: "X402_PAYMENT",
          },
          standardX402SignatureRequired: true,
          instructionToAgent:
            "Review the x402 requirement with the user. AgentPay can prepare the stablecoin transfer with paymentInput, but standard x402 exact endpoints still require a PAYMENT-SIGNATURE payload from an x402-capable signer.",
        };
      },
    });

    registerAgentPayMcpTools(server, runtime);
    const registered = server.tools.get("parse_x402_payment_required");

    assert.ok(registered);
    assert.match(String(registered.metadata.description), /x402/);

    const result = await registered.handler({
      paymentRequired: {
        x402Version: 2,
        resource: {
          url: "https://api.example.com/premium-data",
        },
        accepts: [
          {
            scheme: "exact",
            network: "eip155:8453",
            amount: "10000",
            asset: "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913",
            payTo: "0x1111111111111111111111111111111111111111",
            maxTimeoutSeconds: 60,
          },
        ],
      },
    });

    assert.equal(x402Inputs.length, 1);
    assert.equal((x402Inputs[0] as { sourceTokenSymbol: string }).sourceTokenSymbol, "USDT");
    assert.deepEqual((result as { structuredContent: unknown }).structuredContent, {
      status: "PARSED",
      x402Version: 2,
      resource: {
        url: "https://api.example.com/premium-data",
        description: "Premium market data",
        serviceName: "Market API",
      },
      selectedRequirement: {
        scheme: "exact",
        network: "eip155:8453",
        chainId: 8453,
        chain: "Base",
        asset: "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913",
        tokenSymbol: "USDC",
        payTo: "0x1111111111111111111111111111111111111111",
        amountAtomic: "10000",
        amount: "0.01",
        maxTimeoutSeconds: 60,
      },
      paymentInput: {
        recipientAddress: "0x1111111111111111111111111111111111111111",
        destinationChainId: 8453,
        destinationChain: "Base",
        destinationTokenSymbol: "USDC",
        amountOut: "0.01",
        purpose: "x402 payment for Market API: Premium market data",
        sourceTokenSymbol: "USDT",
        paymentType: "X402_PAYMENT",
      },
      standardX402SignatureRequired: true,
      instructionToAgent:
        "Review the x402 requirement with the user. AgentPay can prepare the stablecoin transfer with paymentInput, but standard x402 exact endpoints still require a PAYMENT-SIGNATURE payload from an x402-capable signer.",
    });
  });

  it("registers prepare_payment and returns structured MCP content", async () => {
    const server = new FakeMcpServer();
    const prepareInputs: unknown[] = [];
    const runtime = createRuntime({
      async preparePayment(input) {
        prepareInputs.push(input);
        return {
          paymentIntentId: "pay_runtime",
          status: "AWAITING_APPROVAL",
          approvalPhrase: "APPROVE pay_runtime",
          summary: {
            pay: "10 USDC",
            recipientAddress: "0x1111111111111111111111111111111111111111",
            destinationChain: "Base",
            sourceSpend: "10.2 USDT",
            maxNativeFee: "2500000000000000",
            maxNativeFeeDisplay: "0.0025 BNB",
            routeProvider: "LI.FI",
            routeSummary: "LI.FI route prepared.",
            routeTarget: "0x7777777777777777777777777777777777777777",
            routeCalldataHash: "0x56570de287d73cd1cb6092bb8fdee6173974955fdef345ae579ee9f475ea7432",
            requiresRouteTargetAllowlist: true,
            estimatedFee: "0.12",
            estimatedEtaSeconds: 120,
            deadline: "2026-07-02T14:45:00.000Z",
            purpose: "design bounty",
          },
          instructionToAgent: "Ask the user to reply exactly: APPROVE pay_runtime",
        };
      },
    });

    registerAgentPayMcpTools(server, runtime);
    const registered = server.tools.get("prepare_payment");

    assert.ok(registered);
    assert.match(String(registered.metadata.description), /Prepare an AgentPay payment intent/);
    assert.ok("recipientAddress" in (registered.metadata.inputSchema as Record<string, unknown>));

    const result = await registered.handler({
      recipientAddress: "0x1111111111111111111111111111111111111111",
      destinationChainId: 8453,
      destinationTokenSymbol: "USDC",
      amountOut: "10",
      purpose: "design bounty",
    });

    assert.deepEqual(prepareInputs, [
      {
        recipientAddress: "0x1111111111111111111111111111111111111111",
        destinationChainId: 8453,
        destinationTokenSymbol: "USDC",
        amountOut: "10",
        purpose: "design bounty",
        sourceTokenSymbol: "USDT",
        paymentType: "WALLET_PAYMENT",
      },
    ]);
    assert.deepEqual(result, {
      content: [
        {
          type: "text",
          text: JSON.stringify((result as { structuredContent: unknown }).structuredContent, null, 2),
        },
      ],
      structuredContent: {
        paymentIntentId: "pay_runtime",
        status: "AWAITING_APPROVAL",
        approvalPhrase: "APPROVE pay_runtime",
        summary: {
          pay: "10 USDC",
          recipientAddress: "0x1111111111111111111111111111111111111111",
          destinationChain: "Base",
          sourceSpend: "10.2 USDT",
          maxNativeFee: "2500000000000000",
          maxNativeFeeDisplay: "0.0025 BNB",
          routeProvider: "LI.FI",
          routeSummary: "LI.FI route prepared.",
          routeTarget: "0x7777777777777777777777777777777777777777",
          routeCalldataHash: "0x56570de287d73cd1cb6092bb8fdee6173974955fdef345ae579ee9f475ea7432",
          requiresRouteTargetAllowlist: true,
          estimatedFee: "0.12",
          estimatedEtaSeconds: 120,
          deadline: "2026-07-02T14:45:00.000Z",
          purpose: "design bounty",
        },
        instructionToAgent: "Ask the user to reply exactly: APPROVE pay_runtime",
      },
    });
  });

  it("registers prepare_contract_call and returns structured MCP content", async () => {
    const server = new FakeMcpServer();
    const contractInputs: unknown[] = [];
    const runtime = createRuntime({
      async prepareContractCall(input) {
        contractInputs.push(input);
        return {
          paymentIntentId: "pay_contract",
          status: "AWAITING_APPROVAL",
          approvalPhrase: "APPROVE pay_contract",
          summary: {
            targetAddress: "0x8888888888888888888888888888888888888888",
            chainId: 56,
            chain: "BNB Chain",
            sourceTokenSymbol: "USDT",
            maxTokenSpend: "7.5",
            maxNativeFee: "0",
            callDataHash: "0x40eed0325a12c6c6af8db2ea05450bfe21d6343b6fe955bff65045b67d9d5fe6",
            requiresTargetAllowlist: true,
            deadline: "2026-07-02T14:45:00.000Z",
            purpose: "mint access pass",
          },
          instructionToAgent:
            "Ask the user to reply exactly:\nAPPROVE pay_contract",
        };
      },
    });

    registerAgentPayMcpTools(server, runtime);
    const registered = server.tools.get("prepare_contract_call");

    assert.ok(registered);
    assert.match(String(registered.metadata.description), /contract call/);

    const result = await registered.handler({
      targetAddress: "0x8888888888888888888888888888888888888888",
      callData: "0xaabbccdd",
      maxTokenSpend: "7.5",
      purpose: "mint access pass",
    });

    assert.deepEqual(contractInputs, [
      {
        targetAddress: "0x8888888888888888888888888888888888888888",
        callData: "0xaabbccdd",
        sourceTokenSymbol: "USDT",
        maxTokenSpend: "7.5",
        maxNativeFee: "0",
        purpose: "mint access pass",
      },
    ]);
    assert.deepEqual((result as { structuredContent: unknown }).structuredContent, {
      paymentIntentId: "pay_contract",
      status: "AWAITING_APPROVAL",
      approvalPhrase: "APPROVE pay_contract",
      summary: {
        targetAddress: "0x8888888888888888888888888888888888888888",
        chainId: 56,
        chain: "BNB Chain",
        sourceTokenSymbol: "USDT",
        maxTokenSpend: "7.5",
        maxNativeFee: "0",
        callDataHash: "0x40eed0325a12c6c6af8db2ea05450bfe21d6343b6fe955bff65045b67d9d5fe6",
        requiresTargetAllowlist: true,
        deadline: "2026-07-02T14:45:00.000Z",
        purpose: "mint access pass",
      },
      instructionToAgent:
        "Ask the user to reply exactly:\nAPPROVE pay_contract",
    });
  });

  it("registers quote_payment_route and returns structured MCP content", async () => {
    const server = new FakeMcpServer();
    const quoteInputs: unknown[] = [];
    const runtime = createRuntime({
      async quotePaymentRoute(input) {
        quoteInputs.push(input);
        return {
          paymentType: "SWAP_BRIDGE_PAY",
          routeProvider: "LI.FI",
          sourceChainId: 56,
          sourceChain: "BNB Chain",
          destinationChainId: 8453,
          destinationChain: "Base",
          sourceTokenSymbol: "USDT",
          sourceTokenAddress: "0x5555555555555555555555555555555555555555",
          destinationTokenSymbol: "USDC",
          destinationTokenAddress: "0x6666666666666666666666666666666666666666",
          amountOut: "10",
          maxAmountIn: "10.2",
          maxNativeFee: "0",
          maxNativeFeeDisplay: "0 BNB",
          routeTarget: "0x7777777777777777777777777777777777777777",
          routeCalldataHash: "0x56570de287d73cd1cb6092bb8fdee6173974955fdef345ae579ee9f475ea7432",
          requiresRouteTargetAllowlist: true,
          estimatedFee: "0.12",
          estimatedEtaSeconds: 120,
          routeSummary: "Spend 10.2 USDT for an estimated 10.17 USDC.",
        };
      },
    });

    registerAgentPayMcpTools(server, runtime);
    const registered = server.tools.get("quote_payment_route");

    assert.ok(registered);
    assert.match(String(registered.metadata.description), /Quote an AgentPay payment route/);

    const result = await registered.handler({
      recipientAddress: "0x1111111111111111111111111111111111111111",
      destinationChainId: 8453,
      destinationTokenSymbol: "USDC",
      amountOut: "10",
    });

    assert.deepEqual(quoteInputs, [
      {
        recipientAddress: "0x1111111111111111111111111111111111111111",
        destinationChainId: 8453,
        destinationTokenSymbol: "USDC",
        amountOut: "10",
        sourceTokenSymbol: "USDT",
      },
    ]);
    assert.deepEqual((result as { structuredContent: unknown }).structuredContent, {
      paymentType: "SWAP_BRIDGE_PAY",
      routeProvider: "LI.FI",
      sourceChainId: 56,
      sourceChain: "BNB Chain",
      destinationChainId: 8453,
      destinationChain: "Base",
      sourceTokenSymbol: "USDT",
      sourceTokenAddress: "0x5555555555555555555555555555555555555555",
      destinationTokenSymbol: "USDC",
      destinationTokenAddress: "0x6666666666666666666666666666666666666666",
      amountOut: "10",
      maxAmountIn: "10.2",
      maxNativeFee: "0",
      maxNativeFeeDisplay: "0 BNB",
      routeTarget: "0x7777777777777777777777777777777777777777",
      routeCalldataHash: "0x56570de287d73cd1cb6092bb8fdee6173974955fdef345ae579ee9f475ea7432",
      requiresRouteTargetAllowlist: true,
      estimatedFee: "0.12",
      estimatedEtaSeconds: 120,
      routeSummary: "Spend 10.2 USDT for an estimated 10.17 USDC.",
    });
  });

  it("registers prepare_route_target_allowance and returns owner transaction content", async () => {
    const server = new FakeMcpServer();
    const allowanceInputs: unknown[] = [];
    const runtime = createRuntime({
      async prepareRouteTargetAllowance(input) {
        allowanceInputs.push(input);
        return {
          status: "READY",
          action: "ALLOW",
          routeTarget: "0x7777777777777777777777777777777777777777",
          allowed: true,
          ownerAddress: "0x2222222222222222222222222222222222222222",
          accountAddress: "0x3333333333333333333333333333333333333333",
          chainId: 56,
          chain: "BNB Chain",
          transaction: {
            from: "0x2222222222222222222222222222222222222222",
            to: "0x3333333333333333333333333333333333333333",
            value: "0",
            chainId: 56,
            data: "0xabcdef",
          },
          instructionToAgent:
            "Ask the owner wallet 0x2222222222222222222222222222222222222222 to submit this transaction on BNB Chain. It allows route target 0x7777777777777777777777777777777777777777 and does not approve any payment.",
        };
      },
    });

    registerAgentPayMcpTools(server, runtime);
    const registered = server.tools.get("prepare_route_target_allowance");

    assert.ok(registered);
    assert.match(String(registered.metadata.description), /owner transaction/);

    const result = await registered.handler({
      routeTarget: "0x7777777777777777777777777777777777777777",
    });

    assert.deepEqual(allowanceInputs, [
      {
        routeTarget: "0x7777777777777777777777777777777777777777",
        allowed: true,
      },
    ]);
    assert.deepEqual((result as { structuredContent: unknown }).structuredContent, {
      status: "READY",
      action: "ALLOW",
      routeTarget: "0x7777777777777777777777777777777777777777",
      allowed: true,
      ownerAddress: "0x2222222222222222222222222222222222222222",
      accountAddress: "0x3333333333333333333333333333333333333333",
      chainId: 56,
      chain: "BNB Chain",
      transaction: {
        from: "0x2222222222222222222222222222222222222222",
        to: "0x3333333333333333333333333333333333333333",
        value: "0",
        chainId: 56,
        data: "0xabcdef",
      },
      instructionToAgent:
        "Ask the owner wallet 0x2222222222222222222222222222222222222222 to submit this transaction on BNB Chain. It allows route target 0x7777777777777777777777777777777777777777 and does not approve any payment.",
    });
  });

  it("registers check_route_target_allowance and returns allowlist status", async () => {
    const server = new FakeMcpServer();
    const allowanceInputs: unknown[] = [];
    const runtime = createRuntime({
      async checkRouteTargetAllowance(input) {
        allowanceInputs.push(input);
        return {
          status: "ACTIVE",
          routeTarget: "0x7777777777777777777777777777777777777777",
          routeTargetAllowed: false,
          ownerAddress: "0x2222222222222222222222222222222222222222",
          accountAddress: "0x3333333333333333333333333333333333333333",
          chainId: 56,
          chain: "BNB Chain",
          instructionToAgent:
            "Route target 0x7777777777777777777777777777777777777777 is not allowlisted on BNB Chain; call prepare_route_target_allowance before execution.",
        };
      },
    });

    registerAgentPayMcpTools(server, runtime);
    const registered = server.tools.get("check_route_target_allowance");

    assert.ok(registered);
    assert.match(String(registered.metadata.description), /allowlisted/);

    const result = await registered.handler({
      routeTarget: "0x7777777777777777777777777777777777777777",
    });

    assert.deepEqual(allowanceInputs, [
      {
        routeTarget: "0x7777777777777777777777777777777777777777",
      },
    ]);
    assert.deepEqual((result as { structuredContent: unknown }).structuredContent, {
      status: "ACTIVE",
      routeTarget: "0x7777777777777777777777777777777777777777",
      routeTargetAllowed: false,
      ownerAddress: "0x2222222222222222222222222222222222222222",
      accountAddress: "0x3333333333333333333333333333333333333333",
      chainId: 56,
      chain: "BNB Chain",
      instructionToAgent:
        "Route target 0x7777777777777777777777777777777777777777 is not allowlisted on BNB Chain; call prepare_route_target_allowance before execution.",
    });
  });

  it("registers prepare_account_admin_transaction and returns owner admin transaction content", async () => {
    const server = new FakeMcpServer();
    const adminInputs: unknown[] = [];
    const runtime = createRuntime({
      async prepareAccountAdminTransaction(input) {
        adminInputs.push(input);
        return {
          status: "READY",
          action: "PAUSE",
          ownerAddress: "0x2222222222222222222222222222222222222222",
          accountAddress: "0x3333333333333333333333333333333333333333",
          chainId: 56,
          chain: "BNB Chain",
          transaction: {
            from: "0x2222222222222222222222222222222222222222",
            to: "0x3333333333333333333333333333333333333333",
            value: "0",
            chainId: 56,
            data: "0xpause",
          },
          instructionToAgent:
            "Ask the owner wallet 0x2222222222222222222222222222222222222222 to submit this PAUSE transaction on BNB Chain. This is an owner admin action and does not approve any payment.",
        };
      },
    });

    registerAgentPayMcpTools(server, runtime);
    const registered = server.tools.get("prepare_account_admin_transaction");

    assert.ok(registered);
    assert.match(String(registered.metadata.description), /owner transaction/);

    const result = await registered.handler({ action: "PAUSE" });

    assert.deepEqual(adminInputs, [{ action: "PAUSE" }]);
    assert.deepEqual((result as { structuredContent: unknown }).structuredContent, {
      status: "READY",
      action: "PAUSE",
      ownerAddress: "0x2222222222222222222222222222222222222222",
      accountAddress: "0x3333333333333333333333333333333333333333",
      chainId: 56,
      chain: "BNB Chain",
      transaction: {
        from: "0x2222222222222222222222222222222222222222",
        to: "0x3333333333333333333333333333333333333333",
        value: "0",
        chainId: 56,
        data: "0xpause",
      },
      instructionToAgent:
        "Ask the owner wallet 0x2222222222222222222222222222222222222222 to submit this PAUSE transaction on BNB Chain. This is an owner admin action and does not approve any payment.",
    });
  });

  it("registers execute_payment and returns MCP errors without throwing from the handler", async () => {
    const server = new FakeMcpServer();
    const runtime = createRuntime({
      async executePayment() {
        throw new Error("Approval text does not exactly match the required phrase.");
      },
    });

    registerAgentPayMcpTools(server, runtime);
    const registered = server.tools.get("execute_payment");

    assert.ok(registered);
    assert.ok("paymentIntentId" in (registered.metadata.inputSchema as Record<string, unknown>));

    const result = await registered.handler({
      paymentIntentId: "pay_runtime",
      approvalText: "yes",
    });

    assert.deepEqual(result, {
      content: [
        {
          type: "text",
          text: "Approval text does not exactly match the required phrase.",
        },
      ],
      isError: true,
    });
  });

  it("registers track_payment, list_transactions, and list_payment_events", async () => {
    const server = new FakeMcpServer();
    const runtime = createRuntime({
      async trackPayment(input) {
        assert.deepEqual(input, { paymentIntentId: "pay_runtime" });
        return {
          paymentIntentId: "pay_runtime",
          status: "COMPLETED",
          sourceTxHash: "0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
          destinationTxHash: "0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
          message: "The transfer is complete.",
        };
      },
      async listTransactions(input) {
        assert.deepEqual(input, { limit: 2 });
        return {
          transactions: [
            {
              paymentIntentId: "pay_runtime",
              status: "COMPLETED",
              paymentType: "WALLET_PAYMENT",
              amountOut: "10",
              destinationTokenSymbol: "USDC",
              destinationChainId: 8453,
              recipientAddress: "0x1111111111111111111111111111111111111111",
              sourceTxHash: "0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
              destinationTxHash: "0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
              createdAt: "2026-07-02T14:30:00.000Z",
            },
          ],
        };
      },
      async listPaymentEvents(input) {
        assert.deepEqual(input, { paymentIntentId: "pay_runtime", limit: 2 });
        return {
          events: [
            {
              eventId: "event_runtime",
              paymentIntentId: "pay_runtime",
              eventType: "PAYMENT_CREATED",
              message: "Payment intent created.",
              metadata: { status: "AWAITING_APPROVAL" },
              createdAt: "2026-07-02T14:30:00.000Z",
            },
          ],
        };
      },
    });

    registerAgentPayMcpTools(server, runtime);
    const tracked = await server.tools.get("track_payment")?.handler({ paymentIntentId: "pay_runtime" });
    const listed = await server.tools.get("list_transactions")?.handler({ limit: 2 });
    const events = await server.tools.get("list_payment_events")?.handler({ paymentIntentId: "pay_runtime", limit: 2 });

    assert.deepEqual((tracked as { structuredContent: unknown }).structuredContent, {
      paymentIntentId: "pay_runtime",
      status: "COMPLETED",
      sourceTxHash: "0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
      destinationTxHash: "0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
      message: "The transfer is complete.",
    });
    assert.deepEqual((listed as { structuredContent: unknown }).structuredContent, {
      transactions: [
        {
          paymentIntentId: "pay_runtime",
          status: "COMPLETED",
          paymentType: "WALLET_PAYMENT",
          amountOut: "10",
          destinationTokenSymbol: "USDC",
          destinationChainId: 8453,
          recipientAddress: "0x1111111111111111111111111111111111111111",
          sourceTxHash: "0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
          destinationTxHash: "0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
          createdAt: "2026-07-02T14:30:00.000Z",
        },
      ],
    });
    assert.deepEqual((events as { structuredContent: unknown }).structuredContent, {
      events: [
        {
          eventId: "event_runtime",
          paymentIntentId: "pay_runtime",
          eventType: "PAYMENT_CREATED",
          message: "Payment intent created.",
          metadata: { status: "AWAITING_APPROVAL" },
          createdAt: "2026-07-02T14:30:00.000Z",
        },
      ],
    });
  });
});

function createRuntime(overrides: Partial<AgentPayRuntime>): AgentPayRuntime {
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
    async parseX402PaymentRequired() {
      throw new Error("parseX402PaymentRequired was not expected.");
    },
    async prepareContractCall() {
      throw new Error("prepareContractCall was not expected.");
    },
    async quotePaymentRoute() {
      throw new Error("quotePaymentRoute was not expected.");
    },
    async preparePayment() {
      throw new Error("preparePayment was not expected.");
    },
    async checkRouteTargetAllowance() {
      throw new Error("checkRouteTargetAllowance was not expected.");
    },
    async prepareAccountAdminTransaction() {
      throw new Error("prepareAccountAdminTransaction was not expected.");
    },
    async prepareRouteTargetAllowance() {
      throw new Error("prepareRouteTargetAllowance was not expected.");
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
