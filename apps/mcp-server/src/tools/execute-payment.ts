import { type ExecutePaymentInput, executePaymentInputSchema, type PaymentIntentRecord } from "@agentpay-ai/shared";

export interface ExecutePaymentIntentRepository {
  getPaymentIntent(paymentIntentId: string): Promise<PaymentIntentRecord | null>;
  claimPaymentApproval(paymentIntentId: string, approvedAt: string): Promise<boolean>;
  markPaymentExecuting(paymentIntentId: string, sourceTxHash: string, approvedAt: string): Promise<void>;
  markPaymentFailed(paymentIntentId: string, errorCode: string, errorMessage: string): Promise<void>;
  markPaymentExpired(paymentIntentId: string): Promise<void>;
}

export interface TokenBalanceCheckRequest {
  accountAddress: string;
  chainId: number;
  tokenAddress: string;
  tokenSymbol: string;
  requiredAmount: string;
}

export interface TokenBalanceChecker {
  hasSufficientTokenBalance(request: TokenBalanceCheckRequest): Promise<boolean>;
}

export interface DirectPaymentExecutionRequest {
  accountAddress: string;
  chainId: number;
  tokenAddress: string;
  tokenSymbol: string;
  recipientAddress: string;
  amount: string;
  nonce: string;
  deadline: string;
}

export interface RoutePaymentExecutionRequest {
  accountAddress: string;
  sourceChainId: number;
  sourceTokenAddress: string;
  sourceTokenSymbol: string;
  maxAmountIn: string;
  destinationChainId: number;
  recipientAddress: string;
  destinationTokenSymbol: string;
  amountOut: string;
  routeTarget: string;
  routeCalldata: string;
  routeCalldataHash: string;
  maxNativeFee: string;
  nonce: string;
  deadline: string;
}

export interface ContractCallExecutionRequest {
  accountAddress: string;
  chainId: number;
  target: string;
  tokenAddress: string;
  tokenSymbol: string;
  maxTokenSpend: string;
  callData: string;
  callDataHash: string;
  maxNativeFee: string;
  nonce: string;
  deadline: string;
}

export interface RoutePaymentExecutionResult {
  sourceTxHash: string;
}

export interface PaymentExecutor {
  executeDirectPayment(request: DirectPaymentExecutionRequest): Promise<RoutePaymentExecutionResult>;
  executeRoutePayment(request: RoutePaymentExecutionRequest): Promise<RoutePaymentExecutionResult>;
  executeContractCall(request: ContractCallExecutionRequest): Promise<RoutePaymentExecutionResult>;
}

export interface ExecutePaymentDependencies {
  paymentIntents: ExecutePaymentIntentRepository;
  balances: TokenBalanceChecker;
  executor: PaymentExecutor;
  clock: () => Date;
}

export interface ExecutePaymentOutput {
  paymentIntentId: string;
  status: "EXECUTING";
  sourceTxHash: string;
  message: "Payment execution started.";
}

export async function executePayment(
  rawInput: ExecutePaymentInput,
  dependencies: ExecutePaymentDependencies,
): Promise<ExecutePaymentOutput> {
  const input = executePaymentInputSchema.parse(rawInput);
  const intent = await dependencies.paymentIntents.getPaymentIntent(input.paymentIntentId);

  if (!intent) {
    throw new Error(`Payment intent ${input.paymentIntentId} was not found.`);
  }

  if (intent.status !== "AWAITING_APPROVAL") {
    throw new Error(`Payment intent ${intent.id} is ${intent.status}, not AWAITING_APPROVAL.`);
  }

  const now = dependencies.clock();
  if (new Date(intent.deadline).getTime() <= now.getTime()) {
    await dependencies.paymentIntents.markPaymentExpired(intent.id);
    throw new Error(`Payment intent ${intent.id} expired.`);
  }

  if (input.approvalText !== intent.approvalPhrase) {
    throw new Error("Approval text does not exactly match the required phrase.");
  }

  const hasBalance = await dependencies.balances.hasSufficientTokenBalance({
    accountAddress: intent.accountAddress,
    chainId: intent.sourceChainId,
    tokenAddress: intent.sourceTokenAddress,
    tokenSymbol: intent.sourceTokenSymbol,
    requiredAmount: intent.maxAmountIn,
  });

  if (!hasBalance) {
    const message = `Insufficient balance for payment intent ${intent.id}.`;
    await dependencies.paymentIntents.markPaymentFailed(intent.id, "INSUFFICIENT_BALANCE", message);
    throw new Error(message);
  }

  const approvedAt = now.toISOString();
  const claimed = await dependencies.paymentIntents.claimPaymentApproval(intent.id, approvedAt);

  if (!claimed) {
    throw new Error(`Payment intent ${intent.id} is already being executed or is no longer awaiting approval.`);
  }

  try {
    const execution = await executeStoredIntent(intent, dependencies.executor);

    await dependencies.paymentIntents.markPaymentExecuting(intent.id, execution.sourceTxHash, approvedAt);

    return {
      paymentIntentId: intent.id,
      status: "EXECUTING",
      sourceTxHash: execution.sourceTxHash,
      message: "Payment execution started.",
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown execution failure.";
    await dependencies.paymentIntents.markPaymentFailed(intent.id, "EXECUTION_FAILED", message);
    throw error;
  }
}

async function executeStoredIntent(intent: PaymentIntentRecord, executor: PaymentExecutor): Promise<RoutePaymentExecutionResult> {
  if (intent.routeProvider === "DIRECT") {
    return executor.executeDirectPayment({
      accountAddress: intent.accountAddress,
      chainId: intent.sourceChainId,
      tokenAddress: intent.sourceTokenAddress,
      tokenSymbol: intent.sourceTokenSymbol,
      recipientAddress: intent.recipientAddress,
      amount: intent.amountOut,
      nonce: intent.nonce,
      deadline: intent.deadline,
    });
  }

  if (intent.routeProvider === "CONTRACT_CALL") {
    return executor.executeContractCall({
      accountAddress: intent.accountAddress,
      chainId: intent.sourceChainId,
      target: intent.routeTarget,
      tokenAddress: intent.sourceTokenAddress,
      tokenSymbol: intent.sourceTokenSymbol,
      maxTokenSpend: intent.maxAmountIn,
      callData: intent.routeCalldata,
      callDataHash: intent.routeCalldataHash,
      maxNativeFee: intent.maxNativeFee,
      nonce: intent.nonce,
      deadline: intent.deadline,
    });
  }

  return executor.executeRoutePayment({
    accountAddress: intent.accountAddress,
    sourceChainId: intent.sourceChainId,
    sourceTokenAddress: intent.sourceTokenAddress,
    sourceTokenSymbol: intent.sourceTokenSymbol,
    maxAmountIn: intent.maxAmountIn,
    destinationChainId: intent.destinationChainId,
    recipientAddress: intent.recipientAddress,
    destinationTokenSymbol: intent.destinationTokenSymbol,
    amountOut: intent.amountOut,
    routeTarget: intent.routeTarget,
    routeCalldata: intent.routeCalldata,
    routeCalldataHash: intent.routeCalldataHash,
    maxNativeFee: intent.maxNativeFee,
    nonce: intent.nonce,
    deadline: intent.deadline,
  });
}

export const executePaymentTool = {
  name: "execute_payment",
  description: "Execute a prepared AgentPay payment only when approval text exactly matches.",
  inputSchema: {
    type: "object",
    additionalProperties: false,
    required: ["paymentIntentId", "approvalText"],
    properties: {
      paymentIntentId: { type: "string" },
      approvalText: { type: "string" },
    },
  },
} as const;

export function createExecutePaymentHandler(dependencies: ExecutePaymentDependencies) {
  return (input: ExecutePaymentInput) => executePayment(input, dependencies);
}
