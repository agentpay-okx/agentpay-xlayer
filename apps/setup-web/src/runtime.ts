import { readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

import {
  createSupabaseAgentPayRepositoriesFromConfig,
  type SupabaseRuntimeConfig,
} from "@agentpay/mcp-server";
import type { SetupIntentRecord } from "@agentpay/shared";

import {
  createEthersAgentPayAccountDeployer,
  type EthersAgentPayAccountDeployerConfig,
} from "./services/account-deployer.ts";
import {
  completeWalletSetup,
  createEthersSetupSignatureVerifier,
  type AgentPayAccountDeployer,
  type CompleteWalletSetupDependencies,
  type CompleteWalletSetupOutput,
} from "./services/complete-wallet-setup.ts";
import type { SetupWebDependencies } from "./server.ts";

const requiredEnvNames = [
  "SUPABASE_URL",
  "SUPABASE_SERVICE_ROLE_KEY",
  "BNB_RPC_URL",
  "SETUP_DEPLOYER_PRIVATE_KEY",
] as const;
const privateKeyPattern = /^0x[a-fA-F0-9]{64}$/;
const hexDataPattern = /^0x(?:[a-fA-F0-9]{2})+$/;
const addressPattern = /^0x[a-fA-F0-9]{40}$/;
const setupHomeChainIds = new Set([56, 97]);

export interface SetupWebRuntimeConfig {
  supabaseUrl: string;
  serviceRoleKey: string;
  bnbRpcUrl: string;
  setupDeployerPrivateKey: string;
  agentPayAccountBytecode: string;
  homeChainId?: number;
  initialAllowedRouteTargets?: string[];
  setupWebPort?: number;
}

export interface SetupWebRepositoryBundle {
  setupIntents: CompleteWalletSetupDependencies["setupIntents"] & {
    getSetupIntent(setupIntentId: string): Promise<SetupIntentRecord | null>;
  };
  wallets: CompleteWalletSetupDependencies["wallets"];
}

export interface SetupWebRuntimeOptions {
  clock?: () => Date;
  fetch?: typeof fetch;
  createRepositories?: (config: SupabaseRuntimeConfig) => SetupWebRepositoryBundle;
  createDeployer?: (config: EthersAgentPayAccountDeployerConfig) => AgentPayAccountDeployer;
}

export function loadSetupWebConfigEnv(
  env: NodeJS.ProcessEnv | Record<string, string | undefined>,
): Record<string, string | undefined> {
  const configPath = env.AGENTPAY_CONFIG ? expandHome(env.AGENTPAY_CONFIG) : undefined;

  if (!configPath) {
    return { ...env };
  }

  const rawConfig = JSON.parse(readFileSync(configPath, "utf8")) as Record<string, unknown>;
  const configEnv = Object.fromEntries(
    Object.entries(rawConfig)
      .filter(([, value]) => typeof value === "string")
      .map(([key, value]) => [key, value as string]),
  );

  return {
    ...configEnv,
    ...env,
  };
}

export function parseSetupWebEnv(env: NodeJS.ProcessEnv | Record<string, string | undefined>): SetupWebRuntimeConfig {
  const normalized = Object.fromEntries(
    Object.entries(env).map(([key, value]) => [key, value?.trim() === "" ? undefined : value?.trim()]),
  ) as Record<string, string | undefined>;
  const bytecode = normalized.AGENTPAY_ACCOUNT_BYTECODE ?? readBytecode(normalized.AGENTPAY_ACCOUNT_BYTECODE_PATH);
  const initialAllowedRouteTargets = parseAddressList(normalized.AGENTPAY_INITIAL_ROUTE_TARGETS);
  const homeChainId = parseOptionalHomeChainId(normalized.AGENTPAY_HOME_CHAIN_ID);
  const missing = [
    ...requiredEnvNames.filter((name) => !normalized[name]),
    !bytecode ? "AGENTPAY_ACCOUNT_BYTECODE" : undefined,
  ].filter((name): name is string => Boolean(name));
  const invalid = [
    normalized.SUPABASE_URL && !isHttpUrl(normalized.SUPABASE_URL) ? "SUPABASE_URL" : undefined,
    normalized.BNB_RPC_URL && !isHttpUrl(normalized.BNB_RPC_URL) ? "BNB_RPC_URL" : undefined,
    normalized.SETUP_DEPLOYER_PRIVATE_KEY && !privateKeyPattern.test(normalized.SETUP_DEPLOYER_PRIVATE_KEY)
      ? "SETUP_DEPLOYER_PRIVATE_KEY"
      : undefined,
    bytecode && !hexDataPattern.test(bytecode) ? "AGENTPAY_ACCOUNT_BYTECODE" : undefined,
    initialAllowedRouteTargets.some((target) => !addressPattern.test(target))
      ? "AGENTPAY_INITIAL_ROUTE_TARGETS"
      : undefined,
    normalized.AGENTPAY_HOME_CHAIN_ID && !homeChainId ? "AGENTPAY_HOME_CHAIN_ID" : undefined,
    normalized.SETUP_WEB_PORT && !isPort(normalized.SETUP_WEB_PORT) ? "SETUP_WEB_PORT" : undefined,
  ].filter((name): name is string => Boolean(name));

  if (missing.length > 0 || invalid.length > 0) {
    throw new Error(createConfigErrorMessage(missing, invalid));
  }

  return omitUndefined({
    supabaseUrl: normalized.SUPABASE_URL,
    serviceRoleKey: normalized.SUPABASE_SERVICE_ROLE_KEY,
    bnbRpcUrl: normalized.BNB_RPC_URL,
    setupDeployerPrivateKey: normalized.SETUP_DEPLOYER_PRIVATE_KEY,
    agentPayAccountBytecode: bytecode,
    homeChainId,
    initialAllowedRouteTargets: initialAllowedRouteTargets.length > 0 ? initialAllowedRouteTargets : undefined,
    setupWebPort: normalized.SETUP_WEB_PORT ? Number(normalized.SETUP_WEB_PORT) : undefined,
  }) as SetupWebRuntimeConfig;
}

export function createSetupWebDependencies(
  config: SetupWebRuntimeConfig,
  options: SetupWebRuntimeOptions = {},
): SetupWebDependencies {
  const repositories = (options.createRepositories ?? createSupabaseAgentPayRepositoriesFromConfig)(
    omitUndefined({
      supabaseUrl: config.supabaseUrl,
      serviceRoleKey: config.serviceRoleKey,
      fetch: options.fetch,
    }) as SupabaseRuntimeConfig,
  );
  const deployer = (options.createDeployer ?? createEthersAgentPayAccountDeployer)({
    rpcUrl: config.bnbRpcUrl,
    deployerPrivateKey: config.setupDeployerPrivateKey,
    bytecode: config.agentPayAccountBytecode,
  });
  const completeDependencies: CompleteWalletSetupDependencies = {
    setupIntents: repositories.setupIntents,
    wallets: repositories.wallets,
    deployer,
    signatureVerifier: createEthersSetupSignatureVerifier(),
    clock: options.clock ?? (() => new Date()),
    homeChainId: config.homeChainId,
    initialAllowedRouteTargets: config.initialAllowedRouteTargets,
  };

  return {
    async getSetupIntent(setupIntentId) {
      return repositories.setupIntents.getSetupIntent(setupIntentId);
    },
    async completeWalletSetup(input): Promise<CompleteWalletSetupOutput> {
      return completeWalletSetup(input, completeDependencies);
    },
    clock: completeDependencies.clock,
  };
}

function readBytecode(path: string | undefined): string | undefined {
  return path ? readFileSync(path, "utf8").trim() : undefined;
}

function expandHome(path: string): string {
  return path === "~" || path.startsWith("~/") ? join(homedir(), path.slice(2)) : path;
}

function parseAddressList(value: string | undefined): string[] {
  return value
    ? value
        .split(",")
        .map((item) => item.trim())
        .filter((item) => item.length > 0)
    : [];
}

function parseOptionalHomeChainId(value: string | undefined): number | undefined {
  if (!value) {
    return undefined;
  }

  const parsed = Number(value);
  return Number.isInteger(parsed) && setupHomeChainIds.has(parsed) ? parsed : undefined;
}

function createConfigErrorMessage(missing: string[], invalid: string[]): string {
  const parts = [
    missing.length > 0 ? `missing: ${missing.join(", ")}` : undefined,
    invalid.length > 0 ? `invalid: ${invalid.join(", ")}` : undefined,
  ].filter(Boolean);

  return `Invalid AgentPay setup web environment (${parts.join("; ")}).`;
}

function isHttpUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return url.protocol === "http:" || url.protocol === "https:";
  } catch {
    return false;
  }
}

function isPort(value: string): boolean {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 && parsed <= 65_535;
}

function omitUndefined<T extends Record<string, unknown>>(record: T): Partial<T> {
  return Object.fromEntries(Object.entries(record).filter(([, value]) => value !== undefined)) as Partial<T>;
}
