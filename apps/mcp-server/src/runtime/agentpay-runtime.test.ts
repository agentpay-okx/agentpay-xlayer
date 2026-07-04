import assert from "node:assert/strict";
import { describe, it } from "node:test";

import type { PaymentIntentRecord, RouteQuote, SetupIntentRecord } from "@agentpay-ai/shared";

import {
  createAgentPayRuntime,
  createPaymentIntentId,
  createPaymentNonce,
  parseAgentPayEnv,
  type AgentPayRuntimeFactories,
} from "./agentpay-runtime.ts";

const validPrivateKey = `0x${"1".repeat(64)}`;

describe("parseAgentPayEnv", () => {
  it("parses required runtime config and trims optional LI.FI settings", () => {
    const config = parseAgentPayEnv({
      SUPABASE_URL: " https://agentpay.supabase.co ",
      SUPABASE_SERVICE_ROLE_KEY: " service-role-key ",
      BNB_RPC_URL: " https://bsc-dataseed.binance.org ",
      EXECUTOR_PRIVATE_KEY: ` ${validPrivateKey} `,
      LIFI_API_KEY: " lifi-key ",
      LIFI_BASE_URL: " https://li.quest ",
      SETUP_WEB_URL: " https://setup.agentpay.dev/setup ",
      AGENTPAY_HOME_CHAIN_ID: " 97 ",
      AGENTPAY_BNB_TESTNET_USDC_ADDRESS: " 0x1111111111111111111111111111111111111111 ",
      AGENTPAY_BNB_TESTNET_USDT_ADDRESS: " 0x2222222222222222222222222222222222222222 ",
    });

    assert.deepEqual(config, {
      supabaseUrl: "https://agentpay.supabase.co",
      serviceRoleKey: "service-role-key",
      bnbRpcUrl: "https://bsc-dataseed.binance.org",
      executorPrivateKey: validPrivateKey,
      lifiApiKey: "lifi-key",
      lifiBaseUrl: "https://li.quest",
      setupWebUrl: "https://setup.agentpay.dev/setup",
      homeChainId: 97,
      stableTokenOverrides: {
        97: {
          USDC: {
            address: "0x1111111111111111111111111111111111111111",
          },
          USDT: {
            address: "0x2222222222222222222222222222222222222222",
          },
        },
      },
    });
  });

  it("reports missing and invalid variable names without leaking secret values", () => {
    const sensitiveFixtureValue = "fixture-value-that-must-not-appear";

    assert.throws(
      () =>
        parseAgentPayEnv({
          SUPABASE_URL: "notaurl",
          SUPABASE_SERVICE_ROLE_KEY: sensitiveFixtureValue,
          BNB_RPC_URL: "",
          EXECUTOR_PRIVATE_KEY: "0xabc123",
          AGENTPAY_HOME_CHAIN_ID: "98",
          AGENTPAY_BNB_TESTNET_USDC_ADDRESS: "not-an-address",
        }),
      (error) => {
        assert.ok(error instanceof Error);
        assert.match(error.message, /BNB_RPC_URL/);
        assert.match(error.message, /SUPABASE_URL/);
        assert.match(error.message, /EXECUTOR_PRIVATE_KEY/);
        assert.match(error.message, /AGENTPAY_HOME_CHAIN_ID/);
        assert.match(error.message, /AGENTPAY_BNB_TESTNET_USDC_ADDRESS/);
        assert.doesNotMatch(error.message, new RegExp(sensitiveFixtureValue));
        assert.doesNotMatch(error.message, /0xabc123/);
        return true;
      },
    );
  });
});

describe("runtime identifiers", () => {
  it("creates hex payment IDs and decimal nonce strings from random bytes", () => {
    const incrementalBytes = (size: number) => Uint8Array.from({ length: size }, (_, index) => index);
    const nonceBytes = (size: number) => Uint8Array.from({ length: size }, (_, index) => (index === size - 1 ? 42 : 0));

    assert.equal(createPaymentIntentId(incrementalBytes), "pay_000102030405060708090a0b");
    assert.equal(createPaymentNonce(nonceBytes), "42");
  });
});

describe("createAgentPayRuntime", () => {
  it("wires configured adapters into prepare and execute payment handlers", async () => {
    const createdIntents: PaymentIntentRecord[] = [];
    const createdSetups: SetupIntentRecord[] = [];
    const calls: Array<[string, unknown]> = [];
    const routeQuote: RouteQuote = {
      routeProvider: "LI.FI",
      sourceTokenAddress: "0x5555555555555555555555555555555555555555",
      destinationTokenAddress: "0x6666666666666666666666666666666666666666",
      maxAmountIn: "10.2",
      maxNativeFee: "0",
      routeTarget: "0x7777777777777777777777777777777777777777",
      routeCalldata: "0x1234",
      routeCalldataHash: "0x56570de287d73cd1cb6092bb8fdee6173974955fdef345ae579ee9f475ea7432",
      routeSummary: "LI.FI route prepared.",
      estimatedEtaSeconds: 120,
    };

    const factories: AgentPayRuntimeFactories = {
      createRepositories(config) {
        calls.push(["supabase", config]);
        return {
          wallets: {
            async getActiveWallet() {
              return {
                ownerAddress: "0x2222222222222222222222222222222222222222",
                accountAddress: "0x3333333333333333333333333333333333333333",
                homeChainId: 56,
                executorAddress: "0x4444444444444444444444444444444444444444",
                status: "ACTIVE",
              };
            },
          },
          setupIntents: {
            async createSetupIntent(intent) {
              createdSetups.push(intent);
            },
            async getSetupIntent(setupIntentId) {
              assert.equal(setupIntentId, "setup_runtime");
              return createdSetups.at(0) ?? null;
            },
          },
          paymentIntents: {
            async createPaymentIntent(intent) {
              createdIntents.push(intent);
            },
            async getPaymentIntent(paymentIntentId) {
              assert.equal(paymentIntentId, "pay_runtime");
              return createdIntents.at(0) ?? null;
            },
            async claimPaymentApproval(paymentIntentId, approvedAt) {
              if (createdIntents[0]?.status !== "AWAITING_APPROVAL") {
                return false;
              }
              createdIntents[0] = {
                ...createdIntents[0],
                status: "APPROVED",
                approvedAt,
              };
              calls.push(["approved", { paymentIntentId, approvedAt }]);
              return true;
            },
            async markPaymentExecuting(paymentIntentId, sourceTxHash, approvedAt) {
              if (createdIntents[0]) {
                createdIntents[0] = {
                  ...createdIntents[0],
                  status: "EXECUTING",
                  sourceTxHash,
                  approvedAt,
                };
              }
              calls.push(["executing", { paymentIntentId, sourceTxHash, approvedAt }]);
            },
            async markPaymentFailed(paymentIntentId, errorCode, errorMessage) {
              calls.push(["failed", { paymentIntentId, errorCode, errorMessage }]);
            },
            async markPaymentExpired(paymentIntentId) {
              calls.push(["expired", paymentIntentId]);
            },
            async markPaymentCompleted(paymentIntentId, destinationTxHash, completedAt) {
              if (createdIntents[0]) {
                createdIntents[0] = {
                  ...createdIntents[0],
                  status: "COMPLETED",
                  destinationTxHash,
                };
              }
              calls.push(["completed", { paymentIntentId, destinationTxHash, completedAt }]);
            },
            async listPaymentIntents(request) {
              calls.push(["listPaymentIntents", request]);
              return createdIntents;
            },
          },
          paymentEvents: {
            async listPaymentEvents(request) {
              calls.push(["listPaymentEvents", request]);
              return [
                {
                  id: "event_runtime",
                  paymentIntentId: "pay_runtime",
                  eventType: "PAYMENT_CREATED",
                  message: "Payment intent created.",
                  metadata: { status: "AWAITING_APPROVAL" },
                  createdAt: "2026-07-02T14:30:00.000Z",
                },
              ];
            },
          },
        };
      },
      createRoutes(config) {
        calls.push(["lifi", config]);
        return {
          async quotePaymentRoute() {
            return routeQuote;
          },
          async getRouteStatus(request) {
            calls.push(["getRouteStatus", request]);
            return {
              status: "DONE",
              substatus: "COMPLETED",
              substatusMessage: "The transfer is complete.",
              destinationTxHash: "0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
            };
          },
        };
      },
      createChainAdapters(config) {
        calls.push(["ethers", config]);
        return {
          balances: {
            async hasSufficientTokenBalance() {
              return true;
            },
          },
          sourceTransactions: {
            async getSourceTransactionStatus(request) {
              calls.push(["getSourceTransactionStatus", request]);
              return { status: "SUCCESS" };
            },
          },
          tokenBalances: {
            async getTokenBalance(request) {
              calls.push(["getTokenBalance", request]);
              return { amount: "12.5" };
            },
          },
          nativeBalances: {
            async getNativeBalance(request) {
              calls.push(["getNativeBalance", request]);
              return { amount: "0.03" };
            },
          },
          routeTargetAllowances: {
            async isRouteTargetAllowed(request) {
              calls.push(["isRouteTargetAllowed", request]);
              return false;
            },
          },
          executor: {
            async executeDirectPayment(request) {
              calls.push(["executeDirectPayment", request]);
              return { sourceTxHash: "0xdddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddd" };
            },
            async executeRoutePayment(request) {
              calls.push(["executeRoutePayment", request]);
              return { sourceTxHash: "0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa" };
            },
            async executeContractCall(request) {
              calls.push(["executeContractCall", request]);
              return { sourceTxHash: "0xcccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc" };
            },
          },
        };
      },
    };

    const runtime = createAgentPayRuntime(
      {
        supabaseUrl: "https://agentpay.supabase.co",
        serviceRoleKey: "service-role-key",
        bnbRpcUrl: "https://bsc-dataseed.binance.org",
        executorPrivateKey: validPrivateKey,
        lifiApiKey: "lifi-key",
        setupWebUrl: "https://setup.agentpay.dev/setup",
      },
      {
        clock: () => new Date("2026-07-02T14:30:00.000Z"),
        createId: () => "pay_runtime",
        createNonce: () => "42",
        createSetupIntentId: () => "setup_runtime",
        executorAddress: "0x4444444444444444444444444444444444444444",
        factories,
      },
    );

    const setup = await runtime.prepareWalletCreation({});
    const wallet = await runtime.getAgentWallet({});
    const balance = await runtime.getBalance({ tokenSymbols: ["USDT"] });
    const invoice = await runtime.parseInvoicePayment({
      invoice: [
        "Invoice ID: inv_runtime",
        "Recipient: 0x1111111111111111111111111111111111111111",
        "Destination Chain: Base",
        "Token: USDC",
        "Amount: 10",
        "Purpose: design bounty",
      ].join("\n"),
    });
    const x402 = await runtime.parseX402PaymentRequired({
      paymentRequired: JSON.stringify({
        x402Version: 2,
        resource: {
          url: "https://api.example.com/premium-data",
          description: "Premium market data",
          serviceName: "Market API",
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
      }),
    });
    const quoted = await runtime.quotePaymentRoute({
      recipientAddress: "0x1111111111111111111111111111111111111111",
      destinationChainId: 8453,
      destinationTokenSymbol: "USDC",
      amountOut: "10",
      sourceTokenSymbol: "USDT",
    });
    const allowance = await runtime.prepareRouteTargetAllowance({
      routeTarget: "0x7777777777777777777777777777777777777777",
    });
    const allowanceStatus = await runtime.checkRouteTargetAllowance({
      routeTarget: "0x7777777777777777777777777777777777777777",
    });
    const adminTransaction = await runtime.prepareAccountAdminTransaction({ action: "PAUSE" });
    const prepared = await runtime.preparePayment({
      recipientAddress: "0x1111111111111111111111111111111111111111",
      destinationChainId: 8453,
      destinationTokenSymbol: "USDC",
      amountOut: "10",
      purpose: "design bounty",
      sourceTokenSymbol: "USDT",
    });

    const executed = await runtime.executePayment({
      paymentIntentId: prepared.paymentIntentId,
      approvalText: prepared.approvalPhrase,
    });
    const tracked = await runtime.trackPayment({ paymentIntentId: prepared.paymentIntentId });
    const transactions = await runtime.listTransactions({ limit: 3 });
    const events = await runtime.listPaymentEvents({ paymentIntentId: prepared.paymentIntentId, limit: 1 });
    const contractCall = await runtime.prepareContractCall({
      targetAddress: "0x8888888888888888888888888888888888888888",
      callData: "0xaabbccdd",
      maxTokenSpend: "7.5",
      purpose: "mint access pass",
    });

    assert.equal(setup.setupIntentId, "setup_runtime");
    assert.equal(setup.setupUrl, "https://setup.agentpay.dev/setup?setup_intent_id=setup_runtime");
    assert.equal(createdSetups[0]?.executorAddress, "0x4444444444444444444444444444444444444444");
    assert.equal(wallet.status, "ACTIVE");
    assert.deepEqual(balance, {
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
    });
    assert.equal(invoice.status, "PARSED");
    assert.equal(invoice.invoiceId, "inv_runtime");
    assert.equal(invoice.paymentInput.destinationChain, "Base");
    assert.equal(x402.status, "PARSED");
    assert.equal(x402.resource.serviceName, "Market API");
    assert.equal(x402.paymentInput.destinationChain, "Base");
    assert.equal(x402.standardX402SignatureRequired, true);
    assert.equal(contractCall.paymentIntentId, "pay_runtime");
    assert.equal(contractCall.summary.callDataHash, "0x40eed0325a12c6c6af8db2ea05450bfe21d6343b6fe955bff65045b67d9d5fe6");
    assert.equal(quoted.paymentType, "SWAP_BRIDGE_PAY");
    assert.equal(quoted.maxAmountIn, "10.2");
    assert.equal(allowance.status, "READY");
    assert.equal(allowance.transaction?.to, "0x3333333333333333333333333333333333333333");
    assert.match(allowance.transaction?.data ?? "", /^0x/);
    assert.equal(allowanceStatus.status, "ACTIVE");
    assert.equal(allowanceStatus.routeTargetAllowed, false);
    assert.equal(adminTransaction.status, "READY");
    assert.equal(adminTransaction.transaction?.to, "0x3333333333333333333333333333333333333333");
    assert.equal(prepared.paymentIntentId, "pay_runtime");
    assert.equal(createdIntents[0]?.nonce, "42");
    assert.equal(executed.sourceTxHash, "0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa");
    assert.equal(tracked.status, "COMPLETED");
    assert.equal(tracked.destinationTxHash, "0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb");
    assert.equal(transactions.transactions.length, 1);
    assert.deepEqual(events.events, [
      {
        eventId: "event_runtime",
        paymentIntentId: "pay_runtime",
        eventType: "PAYMENT_CREATED",
        message: "Payment intent created.",
        metadata: { status: "AWAITING_APPROVAL" },
        createdAt: "2026-07-02T14:30:00.000Z",
      },
    ]);
    assert.deepEqual(calls.slice(0, 3), [
      [
        "supabase",
        {
          supabaseUrl: "https://agentpay.supabase.co",
          serviceRoleKey: "service-role-key",
        },
      ],
      [
        "lifi",
        {
          apiKey: "lifi-key",
          integrator: "agentpay",
        },
      ],
      [
        "ethers",
        {
          rpcUrl: "https://bsc-dataseed.binance.org",
          executorPrivateKey: validPrivateKey,
        },
      ],
    ]);
  });
});
