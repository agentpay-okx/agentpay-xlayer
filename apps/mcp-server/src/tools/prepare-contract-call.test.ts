import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { prepareContractCall } from "./prepare-contract-call.ts";

describe("prepareContractCall", () => {
  it("creates a guarded contract-call intent with calldata hash and exact approval", async () => {
    const saved: unknown[] = [];

    const result = await prepareContractCall(
      {
        targetAddress: "0x8888888888888888888888888888888888888888",
        callData: "0xaabbccdd",
        sourceTokenSymbol: "USDT",
        maxTokenSpend: "7.5",
        maxNativeFee: "250000000000000",
        purpose: "mint access pass",
      },
      {
        clock: () => new Date("2026-07-02T14:30:00.000Z"),
        createId: () => "pay_contract",
        createNonce: () => "44",
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
              requiredAmount: "7.5",
            });
            return true;
          },
        },
      },
    );

    assert.equal(result.paymentIntentId, "pay_contract");
    assert.equal(result.status, "AWAITING_APPROVAL");
    assert.equal(result.approvalPhrase, "APPROVE pay_contract");
    assert.deepEqual(result.summary, {
      targetAddress: "0x8888888888888888888888888888888888888888",
      chainId: 56,
      chain: "BNB Chain",
      sourceTokenSymbol: "USDT",
      maxTokenSpend: "7.5",
      maxNativeFee: "250000000000000",
      callDataHash: "0x40eed0325a12c6c6af8db2ea05450bfe21d6343b6fe955bff65045b67d9d5fe6",
      requiresTargetAllowlist: true,
      deadline: "2026-07-02T14:45:00.000Z",
      purpose: "mint access pass",
    });
    assert.match(result.instructionToAgent, /APPROVE pay_contract/);
    assert.deepEqual(saved, [
      {
        id: "pay_contract",
        accountAddress: "0x3333333333333333333333333333333333333333",
        ownerAddress: "0x2222222222222222222222222222222222222222",
        status: "AWAITING_APPROVAL",
        paymentType: "CONTRACT_CALL",
        sourceChainId: 56,
        destinationChainId: 56,
        sourceTokenAddress: "0x55d398326f99059fF775485246999027B3197955",
        sourceTokenSymbol: "USDT",
        destinationTokenAddress: "0x55d398326f99059fF775485246999027B3197955",
        destinationTokenSymbol: "USDT",
        recipientAddress: "0x8888888888888888888888888888888888888888",
        amountOut: "7.5",
        maxAmountIn: "7.5",
        maxNativeFee: "250000000000000",
        routeProvider: "CONTRACT_CALL",
        routeTarget: "0x8888888888888888888888888888888888888888",
        routeCalldata: "0xaabbccdd",
        routeCalldataHash: "0x40eed0325a12c6c6af8db2ea05450bfe21d6343b6fe955bff65045b67d9d5fe6",
        routeSummary: "Contract call to 0x8888888888888888888888888888888888888888 on BNB Chain.",
        estimatedFee: "0",
        estimatedEtaSeconds: 0,
        nonce: "44",
        deadline: "2026-07-02T14:45:00.000Z",
        purpose: "mint access pass",
        approvalPhrase: "APPROVE pay_contract",
      },
    ]);
  });

  it("rejects empty calldata before creating an intent", async () => {
    await assert.rejects(
      () =>
        prepareContractCall(
          {
            targetAddress: "0x8888888888888888888888888888888888888888",
            callData: "0x",
            sourceTokenSymbol: "USDT",
            maxTokenSpend: "7.5",
            purpose: "empty call",
          },
          {
            clock: () => new Date(),
            createId: () => "pay_contract",
            createNonce: () => "44",
            wallets: {
              getActiveWallet: async () => {
                throw new Error("should not load wallet");
              },
            },
            paymentIntents: {
              createPaymentIntent: async () => {
                throw new Error("should not create intent");
              },
            },
            balances: {
              hasSufficientTokenBalance: async () => {
                throw new Error("should not check balance");
              },
            },
          },
        ),
      /callData/,
    );
  });

  it("rejects insufficient source balance before creating a contract-call intent", async () => {
    const saved: unknown[] = [];

    await assert.rejects(
      () =>
        prepareContractCall(
          {
            targetAddress: "0x8888888888888888888888888888888888888888",
            callData: "0xaabbccdd",
            sourceTokenSymbol: "USDT",
            maxTokenSpend: "7.5",
            purpose: "mint access pass",
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
