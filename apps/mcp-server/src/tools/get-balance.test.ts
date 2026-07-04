import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { configureStableTokenMetadataOverrides } from "@agentpay-ai/shared";

import { getBalance } from "./get-balance.ts";

describe("getBalance", () => {
  it("reads configured stablecoin balances for the active wallet", async () => {
    const walletReads: unknown[] = [];
    const reads: unknown[] = [];
    const nativeReads: unknown[] = [];

    const output = await getBalance(
      { network: "mainnet" },
      {
        wallets: {
          async getActiveWallet(request) {
            walletReads.push(request);
            return {
              ownerAddress: "0x2222222222222222222222222222222222222222",
              accountAddress: "0x3333333333333333333333333333333333333333",
              homeChainId: 196,
              executorAddress: "0x4444444444444444444444444444444444444444",
              status: "ACTIVE",
            };
          },
        },
        tokenBalances: {
          async getTokenBalance(request) {
            reads.push(request);
            return {
              amount: request.tokenSymbol === "USDT0" ? "12.5" : "3",
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

    assert.deepEqual(walletReads, [{ homeChainId: 196 }]);
    assert.deepEqual(reads, [
      {
        accountAddress: "0x3333333333333333333333333333333333333333",
        chainId: 196,
        tokenAddress: "0x779Ded0c9e1022225f8E0630b35a9b54bE713736",
        tokenSymbol: "USDT0",
        decimals: 6,
      },
      {
        accountAddress: "0x3333333333333333333333333333333333333333",
        chainId: 196,
        tokenAddress: "0x74b7F16337b8972027F6196A17a631aC6dE26d22",
        tokenSymbol: "USDC",
        decimals: 6,
      },
    ]);
    assert.deepEqual(nativeReads, [
      {
        accountAddress: "0x3333333333333333333333333333333333333333",
        chainId: 196,
        tokenSymbol: "OKB",
        decimals: 18,
      },
    ]);
    assert.deepEqual(output, {
      status: "ACTIVE",
      accountAddress: "0x3333333333333333333333333333333333333333",
      ownerAddress: "0x2222222222222222222222222222222222222222",
      chainId: 196,
      chain: "X Layer",
      balances: [
        {
          tokenSymbol: "USDT0",
          tokenAddress: "0x779Ded0c9e1022225f8E0630b35a9b54bE713736",
          amount: "12.5",
          decimals: 6,
        },
        {
          tokenSymbol: "USDC",
          tokenAddress: "0x74b7F16337b8972027F6196A17a631aC6dE26d22",
          amount: "3",
          decimals: 6,
        },
      ],
      nativeBalance: {
        tokenSymbol: "OKB",
        tokenAddress: "native",
        amount: "0.03",
        decimals: 18,
      },
    });
  });

  it("allows callers to request a stablecoin subset", async () => {
    configureStableTokenMetadataOverrides({
      1952: {
        USDT0: {
          address: "0x9999999999999999999999999999999999999999",
          decimals: 6,
        },
      },
    });
    const walletReads: unknown[] = [];

    try {
      const output = await getBalance(
        { tokenSymbols: ["USDT0"], homeChainId: 1952 },
        {
          wallets: {
            async getActiveWallet(request) {
              walletReads.push(request);
              return {
                ownerAddress: "0x2222222222222222222222222222222222222222",
                accountAddress: "0x3333333333333333333333333333333333333333",
                homeChainId: 1952,
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
        ["USDT0"],
      );
      assert.deepEqual(walletReads, [{ homeChainId: 1952 }]);
    } finally {
      configureStableTokenMetadataOverrides({});
    }
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
