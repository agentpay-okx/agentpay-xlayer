import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { parseX402PaymentRequiredForAgent } from "./x402.ts";

describe("parseX402PaymentRequiredForAgent", () => {
  it("returns normalized payment fields and x402 protocol details", async () => {
    const paymentRequired = Buffer.from(
      JSON.stringify({
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
      "utf8",
    ).toString("base64");

    const output = await parseX402PaymentRequiredForAgent({ paymentRequired });

    assert.deepEqual(output, {
      status: "PARSED",
      x402Version: 2,
      resource: {
        url: "https://api.example.com/premium-data",
        description: "Premium market data",
        serviceName: "Market API",
        mimeType: undefined,
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
});
