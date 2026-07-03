import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { AbiCoder } from "ethers";

import {
  agentPayAccountInterface,
  createEthersNativeBalanceReader,
  createEthersRouteTargetAllowanceChecker,
  createEthersRoutePaymentExecutor,
  createEthersSourceTransactionStatusProvider,
  createEthersTokenBalanceChecker,
  createEthersTokenBalanceReader,
  erc20Interface,
} from "./chain-executor.ts";

describe("createEthersRoutePaymentExecutor", () => {
  it("encodes executeRoutePayment and submits it to the stored account address", async () => {
    const transactions: Array<{ to: string; data: string; value: bigint }> = [];
    const executor = createEthersRoutePaymentExecutor({
      async sendTransaction(transaction) {
        transactions.push(transaction);
        return { hash: "0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa" };
      },
    });

    const result = await executor.executeRoutePayment({
      accountAddress: "0x3333333333333333333333333333333333333333",
      sourceChainId: 56,
      sourceTokenAddress: "0x5555555555555555555555555555555555555555",
      sourceTokenSymbol: "USDT",
      maxAmountIn: "10.18",
      destinationChainId: 8453,
      recipientAddress: "0x1111111111111111111111111111111111111111",
      destinationTokenSymbol: "USDC",
      amountOut: "10",
      routeTarget: "0x7777777777777777777777777777777777777777",
      routeCalldata: "0x1234",
      routeCalldataHash: "0x56570de287d73cd1cb6092bb8fdee6173974955fdef345ae579ee9f475ea7432",
      maxNativeFee: "250000000000000",
      nonce: "42",
      deadline: "2026-07-02T14:45:00.000Z",
    });

    assert.equal(result.sourceTxHash, "0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa");
    assert.equal(transactions.length, 1);
    assert.equal(transactions[0].to, "0x3333333333333333333333333333333333333333");
    assert.equal(transactions[0].value, 250000000000000n);

    const parsed = agentPayAccountInterface.parseTransaction({
      data: transactions[0].data,
      value: transactions[0].value,
    });

    assert.equal(parsed?.name, "executeRoutePayment");
    const intent = parsed?.args[0];
    assert.equal(intent.sourceToken, "0x5555555555555555555555555555555555555555");
    assert.equal(intent.maxAmountIn, 10_180_000_000_000_000_000n);
    assert.equal(intent.destinationChainId, 8453n);
    assert.equal(intent.recipient, "0x1111111111111111111111111111111111111111");
    assert.equal(intent.amountOut, 10_000_000n);
    assert.equal(intent.routeTarget, "0x7777777777777777777777777777777777777777");
    assert.equal(intent.routeCalldataHash, "0x56570de287d73cd1cb6092bb8fdee6173974955fdef345ae579ee9f475ea7432");
    assert.equal(intent.maxNativeFee, 250000000000000n);
    assert.equal(intent.nonce, 42n);
    assert.equal(intent.deadline, 1783003500n);
    assert.equal(parsed?.args[1], "0x1234");
  });

  it("encodes executeDirectPayment and submits it with no native value", async () => {
    const transactions: Array<{ to: string; data: string; value: bigint }> = [];
    const executor = createEthersRoutePaymentExecutor({
      async sendTransaction(transaction) {
        transactions.push(transaction);
        return { hash: "0xdddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddd" };
      },
    });

    const result = await executor.executeDirectPayment({
      accountAddress: "0x3333333333333333333333333333333333333333",
      chainId: 56,
      tokenAddress: "0x55d398326f99059fF775485246999027B3197955",
      tokenSymbol: "USDT",
      recipientAddress: "0x1111111111111111111111111111111111111111",
      amount: "10",
      nonce: "43",
      deadline: "2026-07-02T14:45:00.000Z",
    });

    assert.equal(result.sourceTxHash, "0xdddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddd");
    assert.equal(transactions.length, 1);
    assert.equal(transactions[0].to, "0x3333333333333333333333333333333333333333");
    assert.equal(transactions[0].value, 0n);

    const parsed = agentPayAccountInterface.parseTransaction({
      data: transactions[0].data,
      value: transactions[0].value,
    });

    assert.equal(parsed?.name, "executeDirectPayment");
    const intent = parsed?.args[0];
    assert.equal(intent.token, "0x55d398326f99059fF775485246999027B3197955");
    assert.equal(intent.recipient, "0x1111111111111111111111111111111111111111");
    assert.equal(intent.amount, 10_000_000_000_000_000_000n);
    assert.equal(intent.nonce, 43n);
    assert.equal(intent.deadline, 1783003500n);
  });

  it("encodes executeContractCall and submits it with bounded native value", async () => {
    const transactions: Array<{ to: string; data: string; value: bigint }> = [];
    const executor = createEthersRoutePaymentExecutor({
      async sendTransaction(transaction) {
        transactions.push(transaction);
        return { hash: "0xcccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc" };
      },
    });

    const result = await executor.executeContractCall({
      accountAddress: "0x3333333333333333333333333333333333333333",
      chainId: 56,
      target: "0x8888888888888888888888888888888888888888",
      tokenAddress: "0x55d398326f99059fF775485246999027B3197955",
      tokenSymbol: "USDT",
      maxTokenSpend: "7.5",
      callData: "0xaabbccdd",
      callDataHash: "0x40eed0325a12c6c6af8db2ea05450bfe21d6343b6fe955bff65045b67d9d5fe6",
      maxNativeFee: "250000000000000",
      nonce: "44",
      deadline: "2026-07-02T14:45:00.000Z",
    });

    assert.equal(result.sourceTxHash, "0xcccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc");
    assert.equal(transactions.length, 1);
    assert.equal(transactions[0].to, "0x3333333333333333333333333333333333333333");
    assert.equal(transactions[0].value, 250000000000000n);

    const parsed = agentPayAccountInterface.parseTransaction({
      data: transactions[0].data,
      value: transactions[0].value,
    });

    assert.equal(parsed?.name, "executeContractCall");
    const intent = parsed?.args[0];
    assert.equal(intent.target, "0x8888888888888888888888888888888888888888");
    assert.equal(intent.token, "0x55d398326f99059fF775485246999027B3197955");
    assert.equal(intent.maxTokenSpend, 7_500_000_000_000_000_000n);
    assert.equal(intent.callDataHash, "0x40eed0325a12c6c6af8db2ea05450bfe21d6343b6fe955bff65045b67d9d5fe6");
    assert.equal(intent.maxNativeFee, 250000000000000n);
    assert.equal(intent.nonce, 44n);
    assert.equal(intent.deadline, 1783003500n);
    assert.equal(parsed?.args[1], "0xaabbccdd");
  });
});

describe("createEthersTokenBalanceChecker", () => {
  it("checks ERC20 balanceOf against a decimal stablecoin requirement", async () => {
    const calls: Array<{ to: string; data: string }> = [];
    const checker = createEthersTokenBalanceChecker({
      async call(transaction) {
        calls.push(transaction);
        return AbiCoder.defaultAbiCoder().encode(["uint256"], [10_180_000_000_000_000_000n]);
      },
    });

    const hasBalance = await checker.hasSufficientTokenBalance({
      accountAddress: "0x3333333333333333333333333333333333333333",
      chainId: 56,
      tokenAddress: "0x5555555555555555555555555555555555555555",
      tokenSymbol: "USDT",
      requiredAmount: "10.18",
    });

    assert.equal(hasBalance, true);
    assert.equal(calls.length, 1);
    assert.equal(calls[0].to, "0x5555555555555555555555555555555555555555");
    const parsed = erc20Interface.parseTransaction({ data: calls[0].data });
    assert.equal(parsed?.name, "balanceOf");
    assert.equal(parsed?.args[0], "0x3333333333333333333333333333333333333333");
  });

  it("returns false when ERC20 balance is below the required amount", async () => {
    const checker = createEthersTokenBalanceChecker({
      async call() {
        return AbiCoder.defaultAbiCoder().encode(["uint256"], [10_179_999_999_999_999_999n]);
      },
    });

    const hasBalance = await checker.hasSufficientTokenBalance({
      accountAddress: "0x3333333333333333333333333333333333333333",
      chainId: 56,
      tokenAddress: "0x5555555555555555555555555555555555555555",
      tokenSymbol: "USDT",
      requiredAmount: "10.18",
    });

    assert.equal(hasBalance, false);
  });
});

describe("createEthersRouteTargetAllowanceChecker", () => {
  it("checks the AgentPay account route target allowlist mapping", async () => {
    const calls: Array<{ to: string; data: string }> = [];
    const checker = createEthersRouteTargetAllowanceChecker({
      async call(transaction) {
        calls.push(transaction);
        return AbiCoder.defaultAbiCoder().encode(["bool"], [true]);
      },
    });

    const allowed = await checker.isRouteTargetAllowed({
      accountAddress: "0x3333333333333333333333333333333333333333",
      chainId: 56,
      routeTarget: "0x7777777777777777777777777777777777777777",
    });

    assert.equal(allowed, true);
    assert.equal(calls.length, 1);
    assert.equal(calls[0].to, "0x3333333333333333333333333333333333333333");
    const parsed = agentPayAccountInterface.parseTransaction({ data: calls[0].data });
    assert.equal(parsed?.name, "allowedRouteTargets");
    assert.equal(parsed?.args[0], "0x7777777777777777777777777777777777777777");
  });
});

describe("createEthersSourceTransactionStatusProvider", () => {
  it("normalizes source transaction receipts", async () => {
    const requested: string[] = [];
    const provider = createEthersSourceTransactionStatusProvider({
      async getTransactionReceipt(txHash) {
        requested.push(txHash);

        if (txHash.endsWith("01")) {
          return { status: 1 };
        }

        if (txHash.endsWith("00")) {
          return { status: 0 };
        }

        return null;
      },
    });

    assert.deepEqual(
      await provider.getSourceTransactionStatus({
        txHash: "0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa01",
        chainId: 56,
      }),
      { status: "SUCCESS" },
    );
    assert.deepEqual(
      await provider.getSourceTransactionStatus({
        txHash: "0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa00",
        chainId: 56,
      }),
      { status: "FAILED" },
    );
    assert.deepEqual(
      await provider.getSourceTransactionStatus({
        txHash: "0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaff",
        chainId: 56,
      }),
      { status: "PENDING" },
    );
    assert.deepEqual(requested, [
      "0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa01",
      "0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa00",
      "0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaff",
    ]);
  });
});

describe("createEthersTokenBalanceReader", () => {
  it("formats ERC20 balanceOf results using chain-specific token decimals", async () => {
    const reader = createEthersTokenBalanceReader({
      async call() {
        return AbiCoder.defaultAbiCoder().encode(["uint256"], [12_500_000_000_000_000_000n]);
      },
    });

    const balance = await reader.getTokenBalance({
      accountAddress: "0x3333333333333333333333333333333333333333",
      chainId: 56,
      tokenAddress: "0x5555555555555555555555555555555555555555",
      tokenSymbol: "USDT",
      decimals: 18,
    });

    assert.deepEqual(balance, { amount: "12.5" });
  });
});

describe("createEthersNativeBalanceReader", () => {
  it("formats native balances using native currency decimals", async () => {
    const calls: string[] = [];
    const reader = createEthersNativeBalanceReader({
      async getBalance(accountAddress) {
        calls.push(accountAddress);
        return 30_000_000_000_000_000n;
      },
    });

    const balance = await reader.getNativeBalance({
      accountAddress: "0x3333333333333333333333333333333333333333",
      chainId: 56,
      tokenSymbol: "BNB",
      decimals: 18,
    });

    assert.deepEqual(calls, ["0x3333333333333333333333333333333333333333"]);
    assert.deepEqual(balance, { amount: "0.03" });
  });
});
