import {
  createApprovalInstruction,
  createApprovalPhrase,
  createDirectPaymentRouteQuote,
  formatNativeAmount,
  getChainName,
  isDirectPaymentRoute,
  type PaymentIntentRecord,
  type PreparePaymentInput,
  preparePaymentInputSchema,
  type RouteProvider,
  type RouteQuote,
} from "@agentpay-ai/shared";

import type { TokenBalanceChecker } from "./execute-payment.ts";

export interface AgentWallet {
  ownerAddress: string;
  accountAddress: string;
  homeChainId: number;
  executorAddress: string;
  status: "ACTIVE" | "PAUSED" | "CLOSED";
}

export interface AgentWalletRepository {
  getActiveWallet(): Promise<AgentWallet | null>;
}

export interface RouteQuoteRequest {
  accountAddress: string;
  ownerAddress: string;
  sourceChainId: number;
  destinationChainId: number;
  sourceTokenSymbol: string;
  destinationTokenSymbol: string;
  recipientAddress: string;
  amountOut: string;
  purpose?: string;
}

export interface RouteQuoteProvider {
  quotePaymentRoute(request: RouteQuoteRequest): Promise<RouteQuote>;
}

export interface PaymentIntentRepository {
  createPaymentIntent(intent: PaymentIntentRecord): Promise<void>;
}

export interface PreparePaymentDependencies {
  wallets: AgentWalletRepository;
  routes: RouteQuoteProvider;
  balances: TokenBalanceChecker;
  paymentIntents: PaymentIntentRepository;
  clock: () => Date;
  createId: () => string;
  createNonce: () => string;
  approvalTtlSeconds?: number;
}

export interface PreparePaymentOutput {
  paymentIntentId: string;
  status: "AWAITING_APPROVAL";
  approvalPhrase: string;
  summary: {
    pay: string;
    recipientAddress: string;
    destinationChain: string;
    sourceSpend: string;
    routeProvider: RouteProvider;
    routeSummary: string;
    routeTarget: string;
    routeCalldataHash: string;
    requiresRouteTargetAllowlist: boolean;
    estimatedFee: string;
    estimatedEtaSeconds: number;
    deadline: string;
    purpose: string;
    maxNativeFee: string;
    maxNativeFeeDisplay: string;
  };
  instructionToAgent: string;
}

export async function preparePayment(
  rawInput: PreparePaymentInput,
  dependencies: PreparePaymentDependencies,
): Promise<PreparePaymentOutput> {
  const input = preparePaymentInputSchema.parse(rawInput);
  const wallet = await dependencies.wallets.getActiveWallet();

  if (!wallet || wallet.status !== "ACTIVE") {
    throw new Error("No active AgentPay wallet is available.");
  }

  const quote = isDirectPaymentRoute(
    wallet.homeChainId,
    input.destinationChainId,
    input.sourceTokenSymbol,
    input.destinationTokenSymbol,
  )
    ? createDirectPaymentRouteQuote({
        chainId: wallet.homeChainId,
        tokenSymbol: input.sourceTokenSymbol,
        amountOut: input.amountOut,
      })
    : await dependencies.routes.quotePaymentRoute({
        accountAddress: wallet.accountAddress,
        ownerAddress: wallet.ownerAddress,
        sourceChainId: wallet.homeChainId,
        destinationChainId: input.destinationChainId,
        sourceTokenSymbol: input.sourceTokenSymbol,
        destinationTokenSymbol: input.destinationTokenSymbol,
        recipientAddress: input.recipientAddress,
        amountOut: input.amountOut,
        purpose: input.purpose,
      });

  await assertSufficientSourceTokenBalance({
    balances: dependencies.balances,
    wallet,
    tokenAddress: quote.sourceTokenAddress,
    tokenSymbol: input.sourceTokenSymbol,
    requiredAmount: quote.maxAmountIn,
  });

  const paymentIntentId = dependencies.createId();
  const approvalPhrase = createApprovalPhrase(paymentIntentId);
  const approvalTtlSeconds = dependencies.approvalTtlSeconds ?? 900;
  const deadline = new Date(dependencies.clock().getTime() + approvalTtlSeconds * 1000).toISOString();

  const intent: PaymentIntentRecord = {
    id: paymentIntentId,
    accountAddress: wallet.accountAddress,
    ownerAddress: wallet.ownerAddress,
    status: "AWAITING_APPROVAL",
    paymentType: input.paymentType,
    sourceChainId: wallet.homeChainId,
    destinationChainId: input.destinationChainId,
    sourceTokenAddress: quote.sourceTokenAddress,
    sourceTokenSymbol: input.sourceTokenSymbol,
    destinationTokenAddress: quote.destinationTokenAddress,
    destinationTokenSymbol: input.destinationTokenSymbol,
    recipientAddress: input.recipientAddress,
    amountOut: input.amountOut,
    maxAmountIn: quote.maxAmountIn,
    maxNativeFee: quote.maxNativeFee,
    routeProvider: quote.routeProvider,
    routeTarget: quote.routeTarget,
    routeCalldata: quote.routeCalldata,
    routeCalldataHash: quote.routeCalldataHash,
    routeSummary: quote.routeSummary,
    estimatedFee: quote.estimatedFee,
    estimatedEtaSeconds: quote.estimatedEtaSeconds,
    nonce: dependencies.createNonce(),
    deadline,
    purpose: input.purpose,
    approvalPhrase,
  };

  await dependencies.paymentIntents.createPaymentIntent(intent);

  return {
    paymentIntentId,
    status: "AWAITING_APPROVAL",
    approvalPhrase,
    summary: {
      pay: `${input.amountOut} ${input.destinationTokenSymbol}`,
      recipientAddress: input.recipientAddress,
      destinationChain: getChainName(input.destinationChainId),
      sourceSpend: `${quote.maxAmountIn} ${input.sourceTokenSymbol}`,
      routeProvider: quote.routeProvider,
      routeSummary: quote.routeSummary,
      routeTarget: quote.routeTarget,
      routeCalldataHash: quote.routeCalldataHash,
      requiresRouteTargetAllowlist: quote.routeProvider !== "DIRECT",
      estimatedFee: quote.estimatedFee ?? "0",
      estimatedEtaSeconds: quote.estimatedEtaSeconds ?? 0,
      deadline,
      purpose: input.purpose,
      maxNativeFee: quote.maxNativeFee,
      maxNativeFeeDisplay: formatNativeAmount(quote.maxNativeFee, wallet.homeChainId),
    },
    instructionToAgent: createApprovalInstruction(paymentIntentId),
  };
}

export const preparePaymentTool = {
  name: "prepare_payment",
  description: "Prepare an AgentPay payment intent and return the exact approval phrase.",
  inputSchema: {
    type: "object",
    additionalProperties: false,
    required: ["recipientAddress", "destinationChainId", "destinationTokenSymbol", "amountOut", "purpose"],
    properties: {
      recipientAddress: { type: "string" },
      destinationChainId: { type: "number" },
      destinationTokenSymbol: { type: "string", enum: ["USDC", "USDT"] },
      amountOut: { type: "string" },
      purpose: { type: "string" },
      sourceTokenSymbol: { type: "string", enum: ["USDC", "USDT"] },
      paymentType: { type: "string", enum: ["WALLET_PAYMENT", "INVOICE_PAYMENT", "X402_PAYMENT"] },
    },
  },
} as const;

export function createPreparePaymentHandler(dependencies: PreparePaymentDependencies) {
  return (input: PreparePaymentInput) => preparePayment(input, dependencies);
}

export async function assertSufficientSourceTokenBalance(request: {
  balances: TokenBalanceChecker;
  wallet: AgentWallet;
  tokenAddress: string;
  tokenSymbol: string;
  requiredAmount: string;
}): Promise<void> {
  const hasBalance = await request.balances.hasSufficientTokenBalance({
    accountAddress: request.wallet.accountAddress,
    chainId: request.wallet.homeChainId,
    tokenAddress: request.tokenAddress,
    tokenSymbol: request.tokenSymbol,
    requiredAmount: request.requiredAmount,
  });

  if (!hasBalance) {
    throw new Error(
      `Insufficient AgentPay ${request.tokenSymbol} balance. Required up to ${request.requiredAmount} ${request.tokenSymbol}; top up the AgentPay wallet before requesting approval.`,
    );
  }
}
