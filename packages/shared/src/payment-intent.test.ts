import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  createDirectPaymentRouteQuote,
  createApprovalPhrase,
  createRouteCalldataHash,
  checkRouteTargetAllowanceInputSchema,
  isDirectPaymentRoute,
  preparePaymentInputSchema,
  prepareRouteTargetAllowanceInputSchema,
  quotePaymentRouteInputSchema,
} from "./index.ts";

describe("quotePaymentRouteInputSchema", () => {
  it("defaults sourceTokenSymbol to USDT without requiring a purpose", () => {
    const parsed = quotePaymentRouteInputSchema.parse({
      recipientAddress: "0x1111111111111111111111111111111111111111",
      destinationChainId: 8453,
      destinationTokenSymbol: "USDC",
      amountOut: "10",
    });

    assert.deepEqual(parsed, {
      recipientAddress: "0x1111111111111111111111111111111111111111",
      destinationChainId: 8453,
      destinationTokenSymbol: "USDC",
      amountOut: "10",
      sourceTokenSymbol: "USDT",
    });
  });
});

describe("preparePaymentInputSchema", () => {
  it("defaults sourceTokenSymbol and paymentType while trimming purpose", () => {
    const parsed = preparePaymentInputSchema.parse({
      recipientAddress: "0x1111111111111111111111111111111111111111",
      destinationChainId: 8453,
      destinationTokenSymbol: "USDC",
      amountOut: "10.50",
      purpose: " design bounty ",
    });

    assert.equal(parsed.sourceTokenSymbol, "USDT");
    assert.equal(parsed.paymentType, "WALLET_PAYMENT");
    assert.equal(parsed.purpose, "design bounty");
  });

  it("accepts invoice and x402 payment types for audit classification", () => {
    const baseInput = {
      recipientAddress: "0x1111111111111111111111111111111111111111",
      destinationChainId: 8453,
      destinationTokenSymbol: "USDC",
      amountOut: "10.50",
      purpose: "design bounty",
    } as const;

    assert.equal(
      preparePaymentInputSchema.parse({
        ...baseInput,
        paymentType: "INVOICE_PAYMENT",
      }).paymentType,
      "INVOICE_PAYMENT",
    );
    assert.equal(
      preparePaymentInputSchema.parse({
        ...baseInput,
        paymentType: "X402_PAYMENT",
      }).paymentType,
      "X402_PAYMENT",
    );
  });

  it("rejects contract call payment types in the stablecoin payment tool", () => {
    assert.throws(() =>
      preparePaymentInputSchema.parse({
        recipientAddress: "0x1111111111111111111111111111111111111111",
        destinationChainId: 8453,
        destinationTokenSymbol: "USDC",
        amountOut: "10.50",
        purpose: "contract interaction",
        paymentType: "CONTRACT_CALL",
      }),
    );
  });

  it("rejects zero amount and invalid recipient address", () => {
    assert.throws(() =>
      preparePaymentInputSchema.parse({
        recipientAddress: "0xnot-an-address",
        destinationChainId: 8453,
        destinationTokenSymbol: "USDC",
        amountOut: "0",
        purpose: "design bounty",
      }),
    );
  });
});

describe("direct payment route helpers", () => {
  it("builds direct quotes from chain token metadata", () => {
    assert.equal(isDirectPaymentRoute(56, 56, "USDT", "USDT"), true);
    assert.equal(isDirectPaymentRoute(56, 8453, "USDT", "USDT"), false);

    assert.deepEqual(createDirectPaymentRouteQuote({ chainId: 56, tokenSymbol: "USDT", amountOut: "10" }), {
      routeProvider: "DIRECT",
      sourceTokenAddress: "0x55d398326f99059fF775485246999027B3197955",
      destinationTokenAddress: "0x55d398326f99059fF775485246999027B3197955",
      maxAmountIn: "10",
      maxNativeFee: "0",
      routeTarget: "0x0000000000000000000000000000000000000000",
      routeCalldata: "0x",
      routeCalldataHash: "0xc5d2460186f7233c927e7db2dcc703c0e500b653ca82273b7bfad8045d85a470",
      routeSummary: "Direct 10 USDT transfer on BNB Chain.",
      estimatedFee: "0",
      estimatedEtaSeconds: 0,
    });
  });
});

describe("approval and calldata helpers", () => {
  it("creates exact approval phrase", () => {
    assert.equal(createApprovalPhrase("pay_123"), "APPROVE pay_123");
  });

  it("hashes route calldata as keccak256 hex", () => {
    assert.equal(
      createRouteCalldataHash("0x1234"),
      "0x56570de287d73cd1cb6092bb8fdee6173974955fdef345ae579ee9f475ea7432",
    );
  });
});

describe("prepareRouteTargetAllowanceInputSchema", () => {
  it("defaults to allowing a route target", () => {
    assert.deepEqual(
      prepareRouteTargetAllowanceInputSchema.parse({
        routeTarget: "0x7777777777777777777777777777777777777777",
      }),
      {
        routeTarget: "0x7777777777777777777777777777777777777777",
        allowed: true,
      },
    );
  });

  it("rejects invalid route target addresses", () => {
    assert.throws(() =>
      prepareRouteTargetAllowanceInputSchema.parse({
        routeTarget: "0xnot-an-address",
      }),
    );
  });
});

describe("checkRouteTargetAllowanceInputSchema", () => {
  it("accepts route target addresses", () => {
    assert.deepEqual(
      checkRouteTargetAllowanceInputSchema.parse({
        routeTarget: "0x7777777777777777777777777777777777777777",
      }),
      {
        routeTarget: "0x7777777777777777777777777777777777777777",
      },
    );
  });
});
