import { ContractFactory, JsonRpcProvider, Wallet } from "ethers";

import type {
  AgentPayAccountDeployer,
  AgentPayAccountDeploymentRequest,
  AgentPayAccountDeploymentResult,
} from "./complete-wallet-setup.ts";

const agentPayAccountConstructorAbi = [
  "constructor(address initialOwner,address initialExecutor,address[] initialAllowedTokens,address[] initialAllowedRouteTargets)",
];

export interface AgentPayAccountContractFactory {
  deploy(
    ownerAddress: string,
    executorAddress: string,
    initialAllowedTokenAddresses: string[],
    initialAllowedRouteTargets: string[],
  ): Promise<{
    target: unknown;
    deploymentTransaction(): { hash: string } | null;
    waitForDeployment(): Promise<unknown>;
  }>;
}

export interface EthersAgentPayAccountDeployerConfig {
  rpcUrl: string;
  rpcUrls?: Partial<Record<number, string>>;
  deployerPrivateKey: string;
  bytecode: string;
}

export function createContractFactoryAgentPayAccountDeployer(
  factory: AgentPayAccountContractFactory,
): AgentPayAccountDeployer {
  return {
    async deployAgentPayAccount(
      request: AgentPayAccountDeploymentRequest,
    ): Promise<AgentPayAccountDeploymentResult> {
      const contract = await factory.deploy(
        request.ownerAddress,
        request.executorAddress,
        request.initialAllowedTokenAddresses,
        request.initialAllowedRouteTargets,
      );
      await contract.waitForDeployment();

      return {
        accountAddress: String(contract.target),
        deploymentTxHash: contract.deploymentTransaction()?.hash,
      };
    },
  };
}

export function createEthersAgentPayAccountDeployer(
  config: EthersAgentPayAccountDeployerConfig,
): AgentPayAccountDeployer {
  const factories = new Map<string, AgentPayAccountContractFactory>();

  function getFactory(homeChainId: number): AgentPayAccountContractFactory {
    const rpcUrl = resolveSetupRpcUrlForChain(config, homeChainId);
    const existing = factories.get(rpcUrl);

    if (existing) {
      return existing;
    }

    const provider = new JsonRpcProvider(rpcUrl);
    const signer = new Wallet(config.deployerPrivateKey, provider);
    const factory = new ContractFactory(agentPayAccountConstructorAbi, config.bytecode, signer) as unknown as AgentPayAccountContractFactory;
    factories.set(rpcUrl, factory);
    return factory;
  }

  return {
    async deployAgentPayAccount(request) {
      return createContractFactoryAgentPayAccountDeployer(getFactory(request.homeChainId)).deployAgentPayAccount(request);
    },
  };
}

export function resolveSetupRpcUrlForChain(
  config: Pick<EthersAgentPayAccountDeployerConfig, "rpcUrl" | "rpcUrls">,
  chainId: number,
): string {
  return config.rpcUrls?.[chainId] ?? config.rpcUrl;
}
