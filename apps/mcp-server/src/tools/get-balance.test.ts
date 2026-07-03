import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { getBalance } from "./get-balance.ts";

describe("getBalance", () => {
  it("reads configured stablecoin balances for the active wallet", async () => {
    const reads: unknown[] = [];
    const nativeReads: unknown[] = [];

    const output = await getBalance(
      {},
      {
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
        tokenBalances: {
          async getTokenBalance(request) {
            reads.push(request);
            return {
              amount: request.tokenSymbol === "USDT" ? "12.5" : "3",
            };
          },
        },
        nativeBalances: {
          async getNativeBalance(request) {
            nativeReads.push(request);
            return { amount: "0.03" };
          },
        },
      },
    );

    assert.deepEqual(reads, [
      {
        accountAddress: "0x3333333333333333333333333333333333333333",
        chainId: 56,
        tokenAddress: "0x8AC76a51cc950d9822D68b83fE1Ad97B32Cd580d",
        tokenSymbol: "USDC",
        decimals: 18,
      },
      {
        accountAddress: "0x3333333333333333333333333333333333333333",
        chainId: 56,
        tokenAddress: "0x55d398326f99059fF775485246999027B3197955",
        tokenSymbol: "USDT",
        decimals: 18,
      },
    ]);
    assert.deepEqual(nativeReads, [
      {
        accountAddress: "0x3333333333333333333333333333333333333333",
        chainId: 56,
        tokenSymbol: "BNB",
        decimals: 18,
      },
    ]);
    assert.deepEqual(output, {
      status: "ACTIVE",
      accountAddress: "0x3333333333333333333333333333333333333333",
      ownerAddress: "0x2222222222222222222222222222222222222222",
      chainId: 56,
      chain: "BNB Chain",
      balances: [
        {
          tokenSymbol: "USDC",
          tokenAddress: "0x8AC76a51cc950d9822D68b83fE1Ad97B32Cd580d",
          amount: "3",
          decimals: 18,
        },
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
  });

  it("allows callers to request a stablecoin subset", async () => {
    const output = await getBalance(
      { tokenSymbols: ["USDT"] },
      {
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
        tokenBalances: {
          async getTokenBalance() {
            return { amount: "12.5" };
          },
        },
        nativeBalances: {
          async getNativeBalance() {
            return { amount: "0.03" };
          },
        },
      },
    );

    assert.deepEqual(
      output.balances.map((balance) => balance.tokenSymbol),
      ["USDT"],
    );
  });

  it("returns NOT_CREATED when no active wallet exists", async () => {
    const output = await getBalance(
      {},
      {
        wallets: {
          async getActiveWallet() {
            return null;
          },
        },
        tokenBalances: {
          async getTokenBalance() {
            throw new Error("balance reader should not be called");
          },
        },
        nativeBalances: {
          async getNativeBalance() {
            throw new Error("native balance reader should not be called");
          },
        },
      },
    );

    assert.deepEqual(output, {
      status: "NOT_CREATED",
      accountAddress: null,
      ownerAddress: null,
      chainId: null,
      chain: null,
      balances: [],
      nativeBalance: null,
    });
  });
});
