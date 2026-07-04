import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { quotePaymentRoute } from "./quote-payment-route.ts";

const activeWallet = {
  ownerAddress: "0x2222222222222222222222222222222222222222",
  accountAddress: "0x3333333333333333333333333333333333333333",
  homeChainId: 196,
  executorAddress: "0x4444444444444444444444444444444444444444",
  status: "ACTIVE" as const,
};

describe("quotePaymentRoute", () => {
  it("returns a local direct quote without calling LI.FI for same-chain same-token payments", async () => {
    const output = await quotePaymentRoute(
      {
        recipientAddress: "0x1111111111111111111111111111111111111111",
        destinationChainId: 196,
        destinationTokenSymbol: "USDT0",
        amountOut: "10",
        sourceTokenSymbol: "USDT0",
      },
      {
        wallets: {
          async getActiveWallet() {
            return activeWallet;
          },
        },
        routes: {
          async quotePaymentRoute() {
            throw new Error("should not call LI.FI for direct payments");
          },
        },
        balances: {
          async hasSufficientTokenBalance(request) {
            assert.deepEqual(request, {
              accountAddress: activeWallet.accountAddress,
              chainId: 196,
              tokenAddress: "0x779Ded0c9e1022225f8E0630b35a9b54bE713736",
              tokenSymbol: "USDT0",
              requiredAmount: "10",
            });
            return true;
          },
        },
      },
    );

    assert.deepEqual(output, {
      paymentType: "DIRECT",
      routeProvider: "DIRECT",
      sourceChainId: 196,
      sourceChain: "X Layer",
      destinationChainId: 196,
      destinationChain: "X Layer",
      sourceTokenSymbol: "USDT0",
      sourceTokenAddress: "0x779Ded0c9e1022225f8E0630b35a9b54bE713736",
      destinationTokenSymbol: "USDT0",
      destinationTokenAddress: "0x779Ded0c9e1022225f8E0630b35a9b54bE713736",
      amountOut: "10",
      maxAmountIn: "10",
      maxNativeFee: "0",
      maxNativeFeeDisplay: "0 OKB",
      routeTarget: "0x0000000000000000000000000000000000000000",
      routeCalldataHash: "0xc5d2460186f7233c927e7db2dcc703c0e500b653ca82273b7bfad8045d85a470",
      requiresRouteTargetAllowlist: false,
      estimatedFee: "0",
      estimatedEtaSeconds: 0,
      routeSummary: "Direct 10 USDT0 transfer on X Layer.",
    });
  });

  it("returns LI.FI route target details for route allowlist review", async () => {
    const output = await quotePaymentRoute(
      {
        recipientAddress: "0x1111111111111111111111111111111111111111",
        destinationChainId: 8453,
        destinationTokenSymbol: "USDC",
        amountOut: "10",
      },
      {
        wallets: {
          async getActiveWallet() {
            return activeWallet;
          },
        },
        routes: {
          async quotePaymentRoute() {
            return {
              routeProvider: "LI.FI",
              sourceTokenAddress: "0x5555555555555555555555555555555555555555",
              destinationTokenAddress: "0x6666666666666666666666666666666666666666",
              maxAmountIn: "10.18",
              maxNativeFee: "2500000000000000",
              routeTarget: "0x7777777777777777777777777777777777777777",
              routeCalldata: "0x1234",
              routeCalldataHash: "0x56570de287d73cd1cb6092bb8fdee6173974955fdef345ae579ee9f475ea7432",
              routeSummary: "Swap USDT0 on X Layer, bridge, and pay USDC on Base.",
              estimatedFee: "0.12",
              estimatedEtaSeconds: 120,
            };
          },
        },
        balances: {
          async hasSufficientTokenBalance(request) {
            assert.deepEqual(request, {
              accountAddress: activeWallet.accountAddress,
              chainId: 196,
              tokenAddress: "0x5555555555555555555555555555555555555555",
              tokenSymbol: "USDT0",
              requiredAmount: "10.18",
            });
            return true;
          },
        },
      },
    );

    assert.equal(output.paymentType, "SWAP_BRIDGE_PAY");
    assert.equal(output.maxNativeFee, "2500000000000000");
    assert.equal(output.maxNativeFeeDisplay, "0.0025 OKB");
    assert.equal(output.routeTarget, "0x7777777777777777777777777777777777777777");
    assert.equal(output.routeCalldataHash, "0x56570de287d73cd1cb6092bb8fdee6173974955fdef345ae579ee9f475ea7432");
    assert.equal(output.requiresRouteTargetAllowlist, true);
  });

  it("rejects quotes when the source token balance is insufficient", async () => {
    await assert.rejects(
      () =>
        quotePaymentRoute(
          {
            recipientAddress: "0x1111111111111111111111111111111111111111",
            destinationChainId: 8453,
            destinationTokenSymbol: "USDC",
            amountOut: "10",
          },
          {
            wallets: {
              async getActiveWallet() {
                return activeWallet;
              },
            },
            routes: {
              async quotePaymentRoute() {
                return {
                  routeProvider: "LI.FI",
                  sourceTokenAddress: "0x5555555555555555555555555555555555555555",
                  destinationTokenAddress: "0x6666666666666666666666666666666666666666",
                  maxAmountIn: "10.18",
                  maxNativeFee: "0",
                  routeTarget: "0x7777777777777777777777777777777777777777",
                  routeCalldata: "0x1234",
                  routeCalldataHash: "0x56570de287d73cd1cb6092bb8fdee6173974955fdef345ae579ee9f475ea7432",
                  routeSummary: "Swap USDT0 on X Layer, bridge, and pay USDC on Base.",
                  estimatedFee: "0.12",
                  estimatedEtaSeconds: 120,
                };
              },
            },
            balances: {
              async hasSufficientTokenBalance() {
                return false;
              },
            },
          },
        ),
      /Insufficient AgentPay USDT0 balance/,
    );
  });
});
