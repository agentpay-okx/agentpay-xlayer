import { verifyMessage } from "ethers";

import {
  completeWalletSetupInputSchema,
  getStableTokenAddress,
  STABLE_TOKEN_SYMBOLS,
  type CompleteWalletSetupInput,
  type SetupIntentRecord,
} from "@agentpay/shared";

export interface AgentWalletRecord {
  ownerAddress: string;
  accountAddress: string;
  homeChainId: number;
  executorAddress: string;
  status: "ACTIVE" | "PAUSED" | "CLOSED";
}

export interface SetupCompletionSetupIntentRepository {
  getSetupIntent(setupIntentId: string): Promise<SetupIntentRecord | null>;
  markSetupSigned(setupIntentId: string, ownerAddress: string, signature: string): Promise<void>;
  markSetupCompleted(setupIntentId: string, accountAddress: string, completedAt: string): Promise<void>;
  markSetupExpired(setupIntentId: string): Promise<void>;
  markSetupFailed(setupIntentId: string, errorCode: string, errorMessage: string): Promise<void>;
}

export interface SetupCompletionWalletRepository {
  createAgentWallet(wallet: AgentWalletRecord): Promise<void>;
}

export interface AgentPayAccountDeploymentRequest {
  ownerAddress: string;
  executorAddress: string;
  initialAllowedTokenAddresses: string[];
  initialAllowedRouteTargets: string[];
}

export interface AgentPayAccountDeploymentResult {
  accountAddress: string;
  deploymentTxHash?: string;
}

export interface AgentPayAccountDeployer {
  deployAgentPayAccount(request: AgentPayAccountDeploymentRequest): Promise<AgentPayAccountDeploymentResult>;
}

export interface SetupSignatureVerifier {
  recoverSignerAddress(message: string, signature: string): Promise<string>;
}

export interface CompleteWalletSetupDependencies {
  setupIntents: SetupCompletionSetupIntentRepository;
  wallets: SetupCompletionWalletRepository;
  deployer: AgentPayAccountDeployer;
  signatureVerifier: SetupSignatureVerifier;
  clock: () => Date;
  homeChainId?: number;
  initialAllowedTokenAddresses?: string[];
  initialAllowedRouteTargets?: string[];
}

export interface CompleteWalletSetupOutput {
  setupIntentId: string;
  status: "COMPLETED";
  ownerAddress: string;
  accountAddress: string;
  deploymentTxHash?: string;
  completedAt: string;
}

export async function completeWalletSetup(
  rawInput: CompleteWalletSetupInput,
  dependencies: CompleteWalletSetupDependencies,
): Promise<CompleteWalletSetupOutput> {
  const input = completeWalletSetupInputSchema.parse(rawInput);
  const intent = await dependencies.setupIntents.getSetupIntent(input.setupIntentId);

  if (!intent) {
    throw new Error(`Setup intent ${input.setupIntentId} was not found.`);
  }

  if (intent.status === "COMPLETED" && intent.ownerAddress && intent.accountAddress && intent.completedAt) {
    return {
      setupIntentId: intent.id,
      status: "COMPLETED",
      ownerAddress: intent.ownerAddress,
      accountAddress: intent.accountAddress,
      completedAt: intent.completedAt,
    };
  }

  if (!["PENDING", "SIGNED"].includes(intent.status)) {
    throw new Error(`Setup intent ${intent.id} is ${intent.status}, not PENDING.`);
  }

  if (new Date(intent.expiresAt).getTime() <= dependencies.clock().getTime()) {
    await dependencies.setupIntents.markSetupExpired(intent.id);
    throw new Error(`Setup intent ${intent.id} expired.`);
  }

  const ownerAddress = await dependencies.signatureVerifier.recoverSignerAddress(intent.messageToSign, input.signature);

  if (intent.ownerAddress && !sameAddress(intent.ownerAddress, ownerAddress)) {
    const message = "Setup signature does not match the expected owner address.";
    await dependencies.setupIntents.markSetupFailed(intent.id, "OWNER_MISMATCH", message);
    throw new Error(message);
  }

  await dependencies.setupIntents.markSetupSigned(intent.id, ownerAddress, input.signature);

  try {
    const homeChainId = dependencies.homeChainId ?? 56;
    const deployment = await dependencies.deployer.deployAgentPayAccount({
      ownerAddress,
      executorAddress: intent.executorAddress,
      initialAllowedTokenAddresses:
        dependencies.initialAllowedTokenAddresses ?? defaultAllowedTokenAddresses(homeChainId),
      initialAllowedRouteTargets: dependencies.initialAllowedRouteTargets ?? [],
    });
    const completedAt = dependencies.clock().toISOString();

    await dependencies.wallets.createAgentWallet({
      ownerAddress,
      accountAddress: deployment.accountAddress,
      homeChainId,
      executorAddress: intent.executorAddress,
      status: "ACTIVE",
    });
    await dependencies.setupIntents.markSetupCompleted(intent.id, deployment.accountAddress, completedAt);

    return {
      setupIntentId: intent.id,
      status: "COMPLETED",
      ownerAddress,
      accountAddress: deployment.accountAddress,
      deploymentTxHash: deployment.deploymentTxHash,
      completedAt,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown setup deployment failure.";
    await dependencies.setupIntents.markSetupFailed(intent.id, "DEPLOYMENT_FAILED", message);
    throw error;
  }
}

export function createEthersSetupSignatureVerifier(): SetupSignatureVerifier {
  return {
    async recoverSignerAddress(message, signature) {
      return verifyMessage(message, signature);
    },
  };
}

export function createCompleteWalletSetupHttpHandler(dependencies: CompleteWalletSetupDependencies) {
  return async (request: Request): Promise<Response> => {
    try {
      const body = (await request.json()) as unknown;
      const output = await completeWalletSetup(completeWalletSetupInputSchema.parse(body), dependencies);
      return jsonResponse(output, 200);
    } catch (error) {
      return jsonResponse(
        {
          error: error instanceof Error ? error.message : "Unknown setup completion failure.",
        },
        400,
      );
    }
  };
}

function sameAddress(left: string, right: string): boolean {
  return left.toLowerCase() === right.toLowerCase();
}

function defaultAllowedTokenAddresses(homeChainId: number): string[] {
  return STABLE_TOKEN_SYMBOLS.map((symbol) => getStableTokenAddress(homeChainId, symbol));
}

function jsonResponse(body: unknown, status: number): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "content-type": "application/json",
    },
  });
}
