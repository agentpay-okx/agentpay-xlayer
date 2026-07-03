import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { preparePayment } from "./prepare-payment.ts";

describe("preparePayment", () => {
  it("creates an awaiting-approval payment intent and returns agent instructions", async () => {
    const saved: unknown[] = [];

    const result = await preparePayment(
      {
        recipientAddress: "0x1111111111111111111111111111111111111111",
        destinationChainId: 8453,
        destinationTokenSymbol: "USDC",
        amountOut: "10",
        purpose: "design bounty",
      },
      {
        clock: () => new Date("2026-07-02T14:30:00.000Z"),
        createId: () => "pay_123",
        createNonce: () => "42",
        approvalTtlSeconds: 900,
        wallets: {
          getActiveWallet: async () => ({
            ownerAddress: "0x2222222222222222222222222222222222222222",
            accountAddress: "0x3333333333333333333333333333333333333333",
            homeChainId: 56,
            executorAddress: "0x4444444444444444444444444444444444444444",
            status: "ACTIVE",
          }),
        },
        routes: {
          quotePaymentRoute: async () => ({
            routeProvider: "LI.FI",
            sourceTokenAddress: "0x5555555555555555555555555555555555555555",
            destinationTokenAddress: "0x6666666666666666666666666666666666666666",
            maxAmountIn: "10.18",
            maxNativeFee: "2500000000000000",
            routeTarget: "0x7777777777777777777777777777777777777777",
            routeCalldata: "0x1234",
            routeCalldataHash: "0x56570de287d73cd1cb6092bb8fdee6173974955fdef345ae579ee9f475ea7432",
            routeSummary: "Swap USDT on BNB Chain, bridge, and pay USDC on Base.",
            estimatedFee: "0.12",
            estimatedEtaSeconds: 120,
          }),
        },
        paymentIntents: {
          createPaymentIntent: async (intent) => {
            saved.push(intent);
          },
        },
        balances: {
          hasSufficientTokenBalance: async (request) => {
            assert.deepEqual(request, {
              accountAddress: "0x3333333333333333333333333333333333333333",
              chainId: 56,
              tokenAddress: "0x5555555555555555555555555555555555555555",
              tokenSymbol: "USDT",
              requiredAmount: "10.18",
            });
            return true;
          },
        },
      },
    );

    assert.equal(result.paymentIntentId, "pay_123");
    assert.equal(result.status, "AWAITING_APPROVAL");
    assert.equal(result.approvalPhrase, "APPROVE pay_123");
    assert.equal(result.summary.destinationChain, "Base");
    assert.equal(result.summary.maxNativeFee, "2500000000000000");
    assert.equal(result.summary.maxNativeFeeDisplay, "0.0025 BNB");
    assert.equal(result.summary.routeTarget, "0x7777777777777777777777777777777777777777");
    assert.equal(result.summary.routeCalldataHash, "0x56570de287d73cd1cb6092bb8fdee6173974955fdef345ae579ee9f475ea7432");
    assert.equal(result.summary.requiresRouteTargetAllowlist, true);
    assert.match(result.instructionToAgent, /reply exactly:\nAPPROVE pay_123/);
    assert.equal(saved.length, 1);
    assert.deepEqual(saved[0], {
      id: "pay_123",
      accountAddress: "0x3333333333333333333333333333333333333333",
      ownerAddress: "0x2222222222222222222222222222222222222222",
      status: "AWAITING_APPROVAL",
      paymentType: "WALLET_PAYMENT",
      sourceChainId: 56,
      destinationChainId: 8453,
      sourceTokenAddress: "0x5555555555555555555555555555555555555555",
      sourceTokenSymbol: "USDT",
      destinationTokenAddress: "0x6666666666666666666666666666666666666666",
      destinationTokenSymbol: "USDC",
      recipientAddress: "0x1111111111111111111111111111111111111111",
      amountOut: "10",
      maxAmountIn: "10.18",
      maxNativeFee: "2500000000000000",
      routeProvider: "LI.FI",
      routeTarget: "0x7777777777777777777777777777777777777777",
      routeCalldata: "0x1234",
      routeCalldataHash: "0x56570de287d73cd1cb6092bb8fdee6173974955fdef345ae579ee9f475ea7432",
      routeSummary: "Swap USDT on BNB Chain, bridge, and pay USDC on Base.",
      estimatedFee: "0.12",
      estimatedEtaSeconds: 120,
      nonce: "42",
      deadline: "2026-07-02T14:45:00.000Z",
      purpose: "design bounty",
      approvalPhrase: "APPROVE pay_123",
    });
  });

  it("creates a direct payment intent without requesting a LI.FI route", async () => {
    const saved: unknown[] = [];

    const result = await preparePayment(
      {
        recipientAddress: "0x1111111111111111111111111111111111111111",
        destinationChainId: 56,
        destinationTokenSymbol: "USDT",
        amountOut: "10",
        purpose: "same-chain payout",
        sourceTokenSymbol: "USDT",
      },
      {
        clock: () => new Date("2026-07-02T14:30:00.000Z"),
        createId: () => "pay_direct",
        createNonce: () => "43",
        approvalTtlSeconds: 900,
        wallets: {
          getActiveWallet: async () => ({
            ownerAddress: "0x2222222222222222222222222222222222222222",
            accountAddress: "0x3333333333333333333333333333333333333333",
            homeChainId: 56,
            executorAddress: "0x4444444444444444444444444444444444444444",
            status: "ACTIVE",
          }),
        },
        routes: {
          quotePaymentRoute: async () => {
            throw new Error("should not call LI.FI for direct payments");
          },
        },
        paymentIntents: {
          createPaymentIntent: async (intent) => {
            saved.push(intent);
          },
        },
        balances: {
          hasSufficientTokenBalance: async (request) => {
            assert.deepEqual(request, {
              accountAddress: "0x3333333333333333333333333333333333333333",
              chainId: 56,
              tokenAddress: "0x55d398326f99059fF775485246999027B3197955",
              tokenSymbol: "USDT",
              requiredAmount: "10",
            });
            return true;
          },
        },
      },
    );

    assert.equal(result.summary.routeProvider, "DIRECT");
    assert.equal(result.summary.sourceSpend, "10 USDT");
    assert.equal(result.summary.maxNativeFeeDisplay, "0 BNB");
    assert.equal(result.summary.routeTarget, "0x0000000000000000000000000000000000000000");
    assert.equal(result.summary.routeCalldataHash, "0xc5d2460186f7233c927e7db2dcc703c0e500b653ca82273b7bfad8045d85a470");
    assert.equal(result.summary.requiresRouteTargetAllowlist, false);
    assert.equal(result.summary.routeSummary, "Direct 10 USDT transfer on BNB Chain.");
    assert.deepEqual(saved[0], {
      id: "pay_direct",
      accountAddress: "0x3333333333333333333333333333333333333333",
      ownerAddress: "0x2222222222222222222222222222222222222222",
      status: "AWAITING_APPROVAL",
      paymentType: "WALLET_PAYMENT",
      sourceChainId: 56,
      destinationChainId: 56,
      sourceTokenAddress: "0x55d398326f99059fF775485246999027B3197955",
      sourceTokenSymbol: "USDT",
      destinationTokenAddress: "0x55d398326f99059fF775485246999027B3197955",
      destinationTokenSymbol: "USDT",
      recipientAddress: "0x1111111111111111111111111111111111111111",
      amountOut: "10",
      maxAmountIn: "10",
      maxNativeFee: "0",
      routeProvider: "DIRECT",
      routeTarget: "0x0000000000000000000000000000000000000000",
      routeCalldata: "0x",
      routeCalldataHash: "0xc5d2460186f7233c927e7db2dcc703c0e500b653ca82273b7bfad8045d85a470",
      routeSummary: "Direct 10 USDT transfer on BNB Chain.",
      estimatedFee: "0",
      estimatedEtaSeconds: 0,
      nonce: "43",
      deadline: "2026-07-02T14:45:00.000Z",
      purpose: "same-chain payout",
      approvalPhrase: "APPROVE pay_direct",
    });
  });

  it("persists parser-provided invoice and x402 payment types for audit history", async () => {
    const saved: unknown[] = [];

    await preparePayment(
      {
        recipientAddress: "0x1111111111111111111111111111111111111111",
        destinationChainId: 56,
        destinationTokenSymbol: "USDT",
        amountOut: "10",
        purpose: "Invoice inv_123",
        sourceTokenSymbol: "USDT",
        paymentType: "INVOICE_PAYMENT",
      },
      {
        clock: () => new Date("2026-07-02T14:30:00.000Z"),
        createId: () => "pay_invoice",
        createNonce: () => "44",
        wallets: {
          getActiveWallet: async () => ({
            ownerAddress: "0x2222222222222222222222222222222222222222",
            accountAddress: "0x3333333333333333333333333333333333333333",
            homeChainId: 56,
            executorAddress: "0x4444444444444444444444444444444444444444",
            status: "ACTIVE",
          }),
        },
        routes: {
          quotePaymentRoute: async () => {
            throw new Error("should not call LI.FI for direct payments");
          },
        },
        paymentIntents: {
          createPaymentIntent: async (intent) => {
            saved.push(intent);
          },
        },
        balances: {
          hasSufficientTokenBalance: async () => true,
        },
      },
    );

    await preparePayment(
      {
        recipientAddress: "0x1111111111111111111111111111111111111111",
        destinationChainId: 56,
        destinationTokenSymbol: "USDT",
        amountOut: "0.01",
        purpose: "x402 payment for Market API",
        sourceTokenSymbol: "USDT",
        paymentType: "X402_PAYMENT",
      },
      {
        clock: () => new Date("2026-07-02T14:30:00.000Z"),
        createId: () => "pay_x402",
        createNonce: () => "45",
        wallets: {
          getActiveWallet: async () => ({
            ownerAddress: "0x2222222222222222222222222222222222222222",
            accountAddress: "0x3333333333333333333333333333333333333333",
            homeChainId: 56,
            executorAddress: "0x4444444444444444444444444444444444444444",
            status: "ACTIVE",
          }),
        },
        routes: {
          quotePaymentRoute: async () => {
            throw new Error("should not call LI.FI for direct payments");
          },
        },
        paymentIntents: {
          createPaymentIntent: async (intent) => {
            saved.push(intent);
          },
        },
        balances: {
          hasSufficientTokenBalance: async () => true,
        },
      },
    );

    assert.deepEqual(
      saved.map((intent) => (intent as { paymentType: string }).paymentType),
      ["INVOICE_PAYMENT", "X402_PAYMENT"],
    );
  });

  it("rejects invalid payment amounts before calling dependencies", async () => {
    await assert.rejects(
      () =>
        preparePayment(
          {
            recipientAddress: "0x1111111111111111111111111111111111111111",
            destinationChainId: 8453,
            destinationTokenSymbol: "USDC",
            amountOut: "0",
            purpose: "design bounty",
          },
          {
            clock: () => new Date(),
            createId: () => "pay_123",
            createNonce: () => "42",
            wallets: {
              getActiveWallet: async () => {
                throw new Error("should not be called");
              },
            },
            routes: {
              quotePaymentRoute: async () => {
                throw new Error("should not be called");
              },
            },
            paymentIntents: {
              createPaymentIntent: async () => {
                throw new Error("should not be called");
              },
            },
            balances: {
              hasSufficientTokenBalance: async () => {
                throw new Error("should not be called");
              },
            },
          },
        ),
      /amountOut/,
    );
  });

  it("rejects insufficient source balance before creating an approval intent", async () => {
    const saved: unknown[] = [];

    await assert.rejects(
      () =>
        preparePayment(
          {
            recipientAddress: "0x1111111111111111111111111111111111111111",
            destinationChainId: 8453,
            destinationTokenSymbol: "USDC",
            amountOut: "10",
            purpose: "design bounty",
          },
          {
            clock: () => new Date("2026-07-02T14:30:00.000Z"),
            createId: () => {
              throw new Error("should not create approval id");
            },
            createNonce: () => {
              throw new Error("should not create nonce");
            },
            wallets: {
              getActiveWallet: async () => ({
                ownerAddress: "0x2222222222222222222222222222222222222222",
                accountAddress: "0x3333333333333333333333333333333333333333",
                homeChainId: 56,
                executorAddress: "0x4444444444444444444444444444444444444444",
                status: "ACTIVE",
              }),
            },
            routes: {
              quotePaymentRoute: async () => ({
                routeProvider: "LI.FI",
                sourceTokenAddress: "0x5555555555555555555555555555555555555555",
                destinationTokenAddress: "0x6666666666666666666666666666666666666666",
                maxAmountIn: "10.18",
                maxNativeFee: "0",
                routeTarget: "0x7777777777777777777777777777777777777777",
                routeCalldata: "0x1234",
                routeCalldataHash: "0x56570de287d73cd1cb6092bb8fdee6173974955fdef345ae579ee9f475ea7432",
                routeSummary: "Swap USDT on BNB Chain, bridge, and pay USDC on Base.",
                estimatedFee: "0.12",
                estimatedEtaSeconds: 120,
              }),
            },
            paymentIntents: {
              createPaymentIntent: async (intent) => {
                saved.push(intent);
              },
            },
            balances: {
              hasSufficientTokenBalance: async () => false,
            },
          },
        ),
      /Insufficient AgentPay USDT balance/,
    );

    assert.deepEqual(saved, []);
  });
});
