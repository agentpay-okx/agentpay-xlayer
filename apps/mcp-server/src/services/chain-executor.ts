import { AbiCoder, Interface, JsonRpcProvider, Wallet } from "ethers";
import { getStableTokenDecimalsForChain } from "@agentpay-ai/shared";

import type {
  ContractCallExecutionRequest,
  DirectPaymentExecutionRequest,
  PaymentExecutor,
  RoutePaymentExecutionRequest,
  RoutePaymentExecutionResult,
  TokenBalanceChecker,
  TokenBalanceCheckRequest,
} from "../tools/execute-payment.ts";
import type {
  NativeBalanceReader,
  NativeBalanceReadRequest,
  TokenBalanceReader,
  TokenBalanceReadRequest,
  TokenBalanceReadResult,
} from "../tools/get-balance.ts";
import type {
  SourceTransactionStatusProvider,
  SourceTransactionStatusRequest,
  SourceTransactionStatusResult,
} from "../tools/payment-tracking.ts";
import type {
  RouteTargetAllowanceChecker,
  RouteTargetAllowanceCheckRequest,
} from "../tools/route-target-allowance.ts";

export const agentPayAccountInterface = new Interface([
  "function allowedRouteTargets(address target) view returns (bool)",
  "function executeContractCall((address target,address token,uint256 maxTokenSpend,bytes32 callDataHash,uint256 maxNativeFee,uint256 nonce,uint256 deadline),bytes callData)",
  "function executeDirectPayment((address token,address recipient,uint256 amount,uint256 nonce,uint256 deadline))",
  "function executeRoutePayment((address sourceToken,uint256 maxAmountIn,uint256 destinationChainId,address recipient,uint256 amountOut,address routeTarget,bytes32 routeCalldataHash,uint256 maxNativeFee,uint256 nonce,uint256 deadline),bytes routeCalldata)",
]);

export const erc20Interface = new Interface(["function balanceOf(address account) view returns (uint256)"]);

export interface TransactionSender {
  sendTransaction(transaction: { to: string; data: string; value: bigint }, chainId?: number): Promise<{ hash: string }>;
}

export interface RpcCaller {
  call(transaction: { to: string; data: string }, chainId?: number): Promise<string>;
}

export interface NativeBalanceCaller {
  getBalance(accountAddress: string, chainId?: number): Promise<bigint>;
}

export interface TransactionReceiptCaller {
  getTransactionReceipt(txHash: string, chainId?: number): Promise<{ status: number | bigint | null } | null>;
}

export interface EthersRuntimeConfig {
  rpcUrl: string;
  rpcUrls?: Partial<Record<number, string>>;
  executorPrivateKey: string;
}

export function createEthersRoutePaymentExecutor(sender: TransactionSender): PaymentExecutor {
  return {
    async executeDirectPayment(request: DirectPaymentExecutionRequest): Promise<RoutePaymentExecutionResult> {
      const transaction = await sender.sendTransaction({
        to: request.accountAddress,
        data: encodeExecuteDirectPaymentCalldata(request),
        value: 0n,
      }, request.chainId);

      return { sourceTxHash: transaction.hash };
    },
    async executeRoutePayment(request: RoutePaymentExecutionRequest): Promise<RoutePaymentExecutionResult> {
      const transaction = await sender.sendTransaction({
        to: request.accountAddress,
        data: encodeExecuteRoutePaymentCalldata(request),
        value: BigInt(request.maxNativeFee),
      }, request.sourceChainId);

      return { sourceTxHash: transaction.hash };
    },
    async executeContractCall(request: ContractCallExecutionRequest): Promise<RoutePaymentExecutionResult> {
      const transaction = await sender.sendTransaction({
        to: request.accountAddress,
        data: encodeExecuteContractCallCalldata(request),
        value: BigInt(request.maxNativeFee),
      }, request.chainId);

      return { sourceTxHash: transaction.hash };
    },
  };
}

export function createEthersTokenBalanceChecker(caller: RpcCaller): TokenBalanceChecker {
  return {
    async hasSufficientTokenBalance(request: TokenBalanceCheckRequest): Promise<boolean> {
      const balanceData = await caller.call({
        to: request.tokenAddress,
        data: erc20Interface.encodeFunctionData("balanceOf", [request.accountAddress]),
      }, request.chainId);
      const [balance] = AbiCoder.defaultAbiCoder().decode(["uint256"], balanceData);
      return (
        BigInt(balance) >=
        decimalToAtomic(request.requiredAmount, getStableTokenDecimalsForChain(request.chainId, request.tokenSymbol))
      );
    },
  };
}

export function createEthersSourceTransactionStatusProvider(
  caller: TransactionReceiptCaller,
): SourceTransactionStatusProvider {
  return {
    async getSourceTransactionStatus(
      request: SourceTransactionStatusRequest,
    ): Promise<SourceTransactionStatusResult> {
      const receipt = await caller.getTransactionReceipt(request.txHash, request.chainId);

      if (!receipt || receipt.status === null) {
        return { status: "PENDING" };
      }

      return Number(receipt.status) === 1 ? { status: "SUCCESS" } : { status: "FAILED" };
    },
  };
}

export function createEthersRouteTargetAllowanceChecker(caller: RpcCaller): RouteTargetAllowanceChecker {
  return {
    async isRouteTargetAllowed(request: RouteTargetAllowanceCheckRequest): Promise<boolean> {
      const allowedData = await caller.call({
        to: request.accountAddress,
        data: agentPayAccountInterface.encodeFunctionData("allowedRouteTargets", [request.routeTarget]),
      }, request.chainId);
      const [allowed] = AbiCoder.defaultAbiCoder().decode(["bool"], allowedData);
      return Boolean(allowed);
    },
  };
}

export function createEthersTokenBalanceReader(caller: RpcCaller): TokenBalanceReader {
  return {
    async getTokenBalance(request: TokenBalanceReadRequest): Promise<TokenBalanceReadResult> {
      const balanceData = await caller.call({
        to: request.tokenAddress,
        data: erc20Interface.encodeFunctionData("balanceOf", [request.accountAddress]),
      }, request.chainId);
      const [balance] = AbiCoder.defaultAbiCoder().decode(["uint256"], balanceData);
      return {
        amount: atomicToDecimal(BigInt(balance), request.decimals),
      };
    },
  };
}

export function createEthersNativeBalanceReader(caller: NativeBalanceCaller): NativeBalanceReader {
  return {
    async getNativeBalance(request: NativeBalanceReadRequest): Promise<TokenBalanceReadResult> {
      const balance = await caller.getBalance(request.accountAddress, request.chainId);
      return {
        amount: atomicToDecimal(balance, request.decimals),
      };
    },
  };
}

export function createEthersRuntimeAdapters(config: EthersRuntimeConfig): {
  executor: PaymentExecutor;
  balances: TokenBalanceChecker;
  sourceTransactions: SourceTransactionStatusProvider;
  tokenBalances: TokenBalanceReader;
  nativeBalances: NativeBalanceReader;
  routeTargetAllowances: RouteTargetAllowanceChecker;
} {
  const providerRouter = createProviderRouter(config);
  const sender: TransactionSender = {
    async sendTransaction(transaction, chainId) {
      const wallet = new Wallet(config.executorPrivateKey, providerRouter.getProvider(chainId));
      return wallet.sendTransaction(transaction);
    },
  };

  return {
    executor: createEthersRoutePaymentExecutor(sender),
    balances: createEthersTokenBalanceChecker(providerRouter),
    sourceTransactions: createEthersSourceTransactionStatusProvider(providerRouter),
    tokenBalances: createEthersTokenBalanceReader(providerRouter),
    nativeBalances: createEthersNativeBalanceReader(providerRouter),
    routeTargetAllowances: createEthersRouteTargetAllowanceChecker(providerRouter),
  };
}

export function resolveRpcUrlForChain(config: Pick<EthersRuntimeConfig, "rpcUrl" | "rpcUrls">, chainId?: number): string {
  return chainId !== undefined ? config.rpcUrls?.[chainId] ?? config.rpcUrl : config.rpcUrl;
}

function createProviderRouter(config: EthersRuntimeConfig): RpcCaller & NativeBalanceCaller & TransactionReceiptCaller & {
  getProvider(chainId?: number): JsonRpcProvider;
} {
  const providers = new Map<string, JsonRpcProvider>();

  function getProvider(chainId?: number): JsonRpcProvider {
    const rpcUrl = resolveRpcUrlForChain(config, chainId);
    const existing = providers.get(rpcUrl);

    if (existing) {
      return existing;
    }

    const provider = new JsonRpcProvider(rpcUrl);
    providers.set(rpcUrl, provider);
    return provider;
  }

  return {
    getProvider,
    async call(transaction, chainId) {
      return getProvider(chainId).call(transaction);
    },
    async getBalance(accountAddress, chainId) {
      return getProvider(chainId).getBalance(accountAddress);
    },
    async getTransactionReceipt(txHash, chainId) {
      return getProvider(chainId).getTransactionReceipt(txHash);
    },
  };
}

export function encodeExecuteDirectPaymentCalldata(request: DirectPaymentExecutionRequest): string {
  return agentPayAccountInterface.encodeFunctionData("executeDirectPayment", [
    {
      token: request.tokenAddress,
      recipient: request.recipientAddress,
      amount: decimalToAtomic(request.amount, getStableTokenDecimalsForChain(request.chainId, request.tokenSymbol)),
      nonce: BigInt(request.nonce),
      deadline: isoTimestampToUnixSeconds(request.deadline),
    },
  ]);
}

export function encodeExecuteRoutePaymentCalldata(request: RoutePaymentExecutionRequest): string {
  return agentPayAccountInterface.encodeFunctionData("executeRoutePayment", [
    {
      sourceToken: request.sourceTokenAddress,
      maxAmountIn: decimalToAtomic(
        request.maxAmountIn,
        getStableTokenDecimalsForChain(request.sourceChainId, request.sourceTokenSymbol),
      ),
      destinationChainId: BigInt(request.destinationChainId),
      recipient: request.recipientAddress,
      amountOut: decimalToAtomic(
        request.amountOut,
        getStableTokenDecimalsForChain(request.destinationChainId, request.destinationTokenSymbol),
      ),
      routeTarget: request.routeTarget,
      routeCalldataHash: request.routeCalldataHash,
      maxNativeFee: BigInt(request.maxNativeFee),
      nonce: BigInt(request.nonce),
      deadline: isoTimestampToUnixSeconds(request.deadline),
    },
    request.routeCalldata,
  ]);
}

export function encodeExecuteContractCallCalldata(request: ContractCallExecutionRequest): string {
  return agentPayAccountInterface.encodeFunctionData("executeContractCall", [
    {
      target: request.target,
      token: request.tokenAddress,
      maxTokenSpend: decimalToAtomic(
        request.maxTokenSpend,
        getStableTokenDecimalsForChain(request.chainId, request.tokenSymbol),
      ),
      callDataHash: request.callDataHash,
      maxNativeFee: BigInt(request.maxNativeFee),
      nonce: BigInt(request.nonce),
      deadline: isoTimestampToUnixSeconds(request.deadline),
    },
    request.callData,
  ]);
}

function decimalToAtomic(amount: string, decimals: number): bigint {
  const [whole, fractional = ""] = amount.split(".");
  if (!whole || !/^\d+$/.test(whole) || !/^\d*$/.test(fractional) || fractional.length > decimals) {
    throw new Error(`Invalid decimal amount for ${decimals} decimals: ${amount}`);
  }

  return BigInt(`${whole}${fractional.padEnd(decimals, "0")}`);
}

function atomicToDecimal(amount: bigint, decimals: number): string {
  const padded = amount.toString().padStart(decimals + 1, "0");
  const whole = padded.slice(0, -decimals);
  const fractional = padded.slice(-decimals).replace(/0+$/, "");
  return fractional ? `${whole}.${fractional}` : whole;
}

function isoTimestampToUnixSeconds(value: string): bigint {
  const millis = Date.parse(value);
  if (!Number.isFinite(millis)) {
    throw new Error(`Invalid ISO timestamp: ${value}`);
  }

  return BigInt(Math.floor(millis / 1000));
}
