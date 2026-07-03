import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { parseX402PaymentRequired } from "./x402.ts";

const basePaymentRequired = {
  x402Version: 2,
  error: "PAYMENT-SIGNATURE header is required",
  resource: {
    url: "https://api.example.com/premium-data",
    description: "Premium market data",
    serviceName: "Market API",
    mimeType: "application/json",
  },
  accepts: [
    {
      scheme: "exact",
      network: "eip155:8453",
      amount: "10000",
      asset: "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913",
      payTo: "0x1111111111111111111111111111111111111111",
      maxTimeoutSeconds: 60,
      extra: {
        name: "USDC",
        version: "2",
      },
    },
  ],
  extensions: {},
};

describe("parseX402PaymentRequired", () => {
  it("decodes a v2 PAYMENT-REQUIRED header into prepare_payment fields", () => {
    const paymentRequired = Buffer.from(JSON.stringify(basePaymentRequired), "utf8").toString("base64");

    const parsed = parseX402PaymentRequired({ paymentRequired });

    assert.deepEqual(parsed, {
      x402Version: 2,
      resource: {
        url: "https://api.example.com/premium-data",
        description: "Premium market data",
        serviceName: "Market API",
        mimeType: "application/json",
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
    });
  });

  it("skips unsupported requirements and uses an explicit source token", () => {
    const parsed = parseX402PaymentRequired({
      sourceTokenSymbol: "USDC",
      paymentRequired: JSON.stringify({
        ...basePaymentRequired,
        accepts: [
          {
            scheme: "upto",
            network: "eip155:8453",
            amount: "10000",
            asset: "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913",
            payTo: "0x1111111111111111111111111111111111111111",
            maxTimeoutSeconds: 60,
          },
          {
            scheme: "exact",
            network: "eip155:56",
            amount: "2500000000000000000",
            asset: "0x55d398326f99059fF775485246999027B3197955",
            payTo: "0x1111111111111111111111111111111111111111",
            maxTimeoutSeconds: 60,
          },
        ],
      }),
    });

    assert.equal(parsed.selectedRequirement.chainId, 56);
    assert.equal(parsed.selectedRequirement.tokenSymbol, "USDT");
    assert.equal(parsed.selectedRequirement.amount, "2.5");
    assert.equal(parsed.paymentInput.sourceTokenSymbol, "USDC");
    assert.equal(parsed.paymentInput.paymentType, "X402_PAYMENT");
  });

  it("rejects payment requirements with no AgentPay-supported stablecoin target", () => {
    assert.throws(
      () =>
        parseX402PaymentRequired({
          paymentRequired: JSON.stringify({
            ...basePaymentRequired,
            accepts: [
              {
                scheme: "exact",
                network: "eip155:1",
                amount: "10000",
                asset: "0x0000000000000000000000000000000000000001",
                payTo: "0x1111111111111111111111111111111111111111",
                maxTimeoutSeconds: 60,
              },
            ],
          }),
        }),
      /No AgentPay-supported x402 payment requirement/,
    );
  });
});
