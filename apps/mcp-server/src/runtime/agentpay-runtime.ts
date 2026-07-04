import { randomBytes } from "node:crypto";

import type { ExecutePaymentInput } from "@agentpay-ai/shared";
import type { PreparePaymentInput } from "@agentpay-ai/shared";
import type { GetBalanceInput } from "@agentpay-ai/shared";
import type { ListPaymentEventsInput, ListTransactionsInput, TrackPaymentInput } from "@agentpay-ai/shared";
import type { ParseInvoicePaymentInput } from "@agentpay-ai/shared";
import type { ParseX402PaymentRequiredInput } from "@agentpay-ai/shared";
import type { RetryX402RequestInput } from "@agentpay-ai/shared";
import type { PrepareContractCallInput } from "@agentpay-ai/shared";
import type { PrepareAccountAdminTransactionInput } from "@agentpay-ai/shared";
import type { QuotePaymentRouteInput } from "@agentpay-ai/shared";
import type {
  CheckWalletCreationInput,
  CheckRouteTargetAllowanceInput,
  GetAgentWalletInput,
  PrepareRouteTargetAllowanceInput,
  PrepareWalletCreationInput,
} from "@agentpay-ai/shared";
import {
  configureStableTokenMetadataOverrides,
  type StableTokenMetadataOverrides,
} from "@agentpay-ai/shared";
import { Wallet } from "ethers";

import { createEthersRuntimeAdapters, type EthersRuntimeConfig } from "../services/chain-executor.ts";
import {
  createLifiRouteQuoteProvider,
  createLifiRouteStatusProvider,
  type LifiRouteQuoteProviderConfig,
} from "../services/lifi.ts";
import {
  createSupabaseAgentPayRepositoriesFromConfig,
  type SupabaseRuntimeConfig,
} from "../services/supabase.ts";
import { createExecutePaymentHandler } from "../tools/execute-payment.ts";
import type { ExecutePaymentDependencies } from "../tools/execute-payment.ts";
import { createGetBalanceHandler } from "../tools/get-balance.ts";
import type { GetBalanceDependencies } from "../tools/get-balance.ts";
import { createParseInvoicePaymentHandler } from "../tools/invoice.ts";
import { createParseX402PaymentRequiredHandler, createRetryX402RequestHandler } from "../tools/x402.ts";
import { createPrepareAccountAdminTransactionHandler } from "../tools/account-admin.ts";
import type { PrepareAccountAdminTransactionDependencies } from "../tools/account-admin.ts";
import {
  createListPaymentEventsHandler,
  createListTransactionsHandler,
  createTrackPaymentHandler,
} from "../tools/payment-tracking.ts";
import type {
  ListPaymentEventsDependencies,
  ListTransactionsDependencies,
  TrackPaymentDependencies,
} from "../tools/payment-tracking.ts";
import { createPreparePaymentHandler } from "../tools/prepare-payment.ts";
import type { PreparePaymentDependencies } from "../tools/prepare-payment.ts";
import { createPrepareContractCallHandler } from "../tools/prepare-contract-call.ts";
import type { PrepareContractCallDependencies } from "../tools/prepare-contract-call.ts";
import { createQuotePaymentRouteHandler } from "../tools/quote-payment-route.ts";
import type { QuotePaymentRouteDependencies } from "../tools/quote-payment-route.ts";
import {
  createCheckRouteTargetAllowanceHandler,
  createPrepareRouteTargetAllowanceHandler,
} from "../tools/route-target-allowance.ts";
import type {
  CheckRouteTargetAllowanceDependencies,
  PrepareRouteTargetAllowanceDependencies,
} from "../tools/route-target-allowance.ts";
import {
  createCheckWalletCreationHandler,
  createGetAgentWalletHandler,
  createPrepareWalletCreationHandler,
} from "../tools/wallet-setup.ts";
import type {
  CheckWalletCreationDependencies,
  GetAgentWalletDependencies,
  PrepareWalletCreationDependencies,
} from "../tools/wallet-setup.ts";

const REQUIRED_ENV_NAMES = ["SUPABASE_URL", "SUPABASE_SERVICE_ROLE_KEY", "XLAYER_RPC_URL", "EXECUTOR_PRIVATE_KEY"];
const DEFAULT_SETUP_WEB_URL = "http://localhost:3000/setup";
const privateKeyPattern = /^0x[a-fA-F0-9]{64}$/;
const addressPattern = /^0x[a-fA-F0-9]{40}$/;
const setupHomeChainIds = new Set([196, 1952]);

export interface AgentPayRuntimeConfig {
  supabaseUrl: string;
  serviceRoleKey: string;
  xlayerRpcUrl: string;
  xlayerRpcUrls?: Partial<Record<number, string>>;
  executorPrivateKey: string;
  lifiApiKey?: string;
  lifiBaseUrl?: string;
  setupWebUrl?: string;
  homeChainId?: number;
  stableTokenOverrides?: StableTokenMetadataOverrides;
}

export interface AgentPayRuntimeFactories {
  createRepositories(config: SupabaseRuntimeConfig): Pick<PreparePaymentDependencies, "wallets" | "paymentIntents"> & {
    setupIntents: PrepareWalletCreationDependencies["setupIntents"] & CheckWalletCreationDependencies["setupIntents"];
    paymentIntents: PreparePaymentDependencies["paymentIntents"] &
      ExecutePaymentDependencies["paymentIntents"] &
      TrackPaymentDependencies["paymentIntents"] &
      ListTransactionsDependencies["paymentIntents"];
    paymentEvents: ListPaymentEventsDependencies["paymentEvents"];
  };
  createRoutes(config: LifiRouteQuoteProviderConfig): PreparePaymentDependencies["routes"] &
    TrackPaymentDependencies["routeStatuses"];
  createChainAdapters(config: EthersRuntimeConfig): Pick<ExecutePaymentDependencies, "balances" | "executor"> & {
    sourceTransactions: TrackPaymentDependencies["sourceTransactions"];
    tokenBalances: GetBalanceDependencies["tokenBalances"];
    nativeBalances: GetBalanceDependencies["nativeBalances"];
    routeTargetAllowances: CheckRouteTargetAllowanceDependencies["routeTargetAllowances"];
  };
}

export interface AgentPayRuntimeOptions {
  fetch?: typeof fetch;
  x402Fetch?: typeof fetch;
  clock?: () => Date;
  createId?: () => string;
  createNonce?: () => string;
  createSetupIntentId?: () => string;
  executorAddress?: string;
  approvalTtlSeconds?: number;
  setupTtlSeconds?: number;
  factories?: AgentPayRuntimeFactories;
}

export interface AgentPayRuntime {
  prepareWalletCreation(input: PrepareWalletCreationInput): ReturnType<ReturnType<typeof createPrepareWalletCreationHandler>>;
  checkWalletCreation(input: CheckWalletCreationInput): ReturnType<ReturnType<typeof createCheckWalletCreationHandler>>;
  getAgentWallet(input: GetAgentWalletInput): ReturnType<ReturnType<typeof createGetAgentWalletHandler>>;
  getBalance(input: GetBalanceInput): ReturnType<ReturnType<typeof createGetBalanceHandler>>;
  parseInvoicePayment(input: ParseInvoicePaymentInput): ReturnType<ReturnType<typeof createParseInvoicePaymentHandler>>;
  parseX402PaymentRequired(
    input: ParseX402PaymentRequiredInput,
  ): ReturnType<ReturnType<typeof createParseX402PaymentRequiredHandler>>;
  retryX402Request(input: RetryX402RequestInput): ReturnType<ReturnType<typeof createRetryX402RequestHandler>>;
  prepareContractCall(input: PrepareContractCallInput): ReturnType<ReturnType<typeof createPrepareContractCallHandler>>;
  quotePaymentRoute(input: QuotePaymentRouteInput): ReturnType<ReturnType<typeof createQuotePaymentRouteHandler>>;
  checkRouteTargetAllowance(
    input: CheckRouteTargetAllowanceInput,
  ): ReturnType<ReturnType<typeof createCheckRouteTargetAllowanceHandler>>;
  prepareAccountAdminTransaction(
    input: PrepareAccountAdminTransactionInput,
  ): ReturnType<ReturnType<typeof createPrepareAccountAdminTransactionHandler>>;
  prepareRouteTargetAllowance(
    input: PrepareRouteTargetAllowanceInput,
  ): ReturnType<ReturnType<typeof createPrepareRouteTargetAllowanceHandler>>;
  preparePayment(input: PreparePaymentInput): ReturnType<ReturnType<typeof createPreparePaymentHandler>>;
  executePayment(input: ExecutePaymentInput): ReturnType<ReturnType<typeof createExecutePaymentHandler>>;
  trackPayment(input: TrackPaymentInput): ReturnType<ReturnType<typeof createTrackPaymentHandler>>;
  listTransactions(input: ListTransactionsInput): ReturnType<ReturnType<typeof createListTransactionsHandler>>;
  listPaymentEvents(input: ListPaymentEventsInput): ReturnType<ReturnType<typeof createListPaymentEventsHandler>>;
}

export function parseAgentPayEnv(env: NodeJS.ProcessEnv | Record<string, string | undefined>): AgentPayRuntimeConfig {
  const normalized = Object.fromEntries(
    Object.entries(env).map(([key, value]) => [key, value?.trim() === "" ? undefined : value?.trim()]),
  ) as Record<string, string | undefined>;
  const homeChainId = parseOptionalHomeChainId(normalized.AGENTPAY_HOME_CHAIN_ID);
  const xlayerRpcUrls = parseXLayerRpcUrls(normalized);
  const stableTokenOverrides = parseStableTokenOverrides(normalized);
  const missing = REQUIRED_ENV_NAMES.filter((name) => !normalized[name]);
  const invalid = [
    normalized.SUPABASE_URL && !isHttpUrl(normalized.SUPABASE_URL) ? "SUPABASE_URL" : undefined,
    normalized.XLAYER_RPC_URL && !isHttpUrl(normalized.XLAYER_RPC_URL) ? "XLAYER_RPC_URL" : undefined,
    normalized.XLAYER_MAINNET_RPC_URL && !isHttpUrl(normalized.XLAYER_MAINNET_RPC_URL)
      ? "XLAYER_MAINNET_RPC_URL"
      : undefined,
    normalized.XLAYER_TESTNET_RPC_URL && !isHttpUrl(normalized.XLAYER_TESTNET_RPC_URL)
      ? "XLAYER_TESTNET_RPC_URL"
      : undefined,
    normalized.EXECUTOR_PRIVATE_KEY && !privateKeyPattern.test(normalized.EXECUTOR_PRIVATE_KEY)
      ? "EXECUTOR_PRIVATE_KEY"
      : undefined,
    normalized.LIFI_BASE_URL && !isHttpUrl(normalized.LIFI_BASE_URL) ? "LIFI_BASE_URL" : undefined,
    normalized.SETUP_WEB_URL && !isHttpUrl(normalized.SETUP_WEB_URL) ? "SETUP_WEB_URL" : undefined,
    normalized.AGENTPAY_HOME_CHAIN_ID && !homeChainId ? "AGENTPAY_HOME_CHAIN_ID" : undefined,
    ...validateStableTokenOverrideAddresses(normalized),
  ].filter((name): name is string => Boolean(name));

  if (missing.length > 0 || invalid.length > 0) {
    throw new Error(createConfigErrorMessage(missing, invalid));
  }

  return omitUndefined({
    supabaseUrl: normalized.SUPABASE_URL,
    serviceRoleKey: normalized.SUPABASE_SERVICE_ROLE_KEY,
    xlayerRpcUrl: normalized.XLAYER_RPC_URL,
    xlayerRpcUrls,
    executorPrivateKey: normalized.EXECUTOR_PRIVATE_KEY,
    lifiApiKey: normalized.LIFI_API_KEY,
    lifiBaseUrl: normalized.LIFI_BASE_URL,
    setupWebUrl: normalized.SETUP_WEB_URL,
    homeChainId,
    stableTokenOverrides,
  }) as AgentPayRuntimeConfig;
}

export function createAgentPayRuntime(config: AgentPayRuntimeConfig, options: AgentPayRuntimeOptions = {}): AgentPayRuntime {
  configureStableTokenMetadataOverrides(config.stableTokenOverrides ?? {});
  const factories = options.factories ?? defaultAgentPayRuntimeFactories;
  const clock = options.clock ?? (() => new Date());
  const repositories = factories.createRepositories(
    omitUndefined({
      supabaseUrl: config.supabaseUrl,
      serviceRoleKey: config.serviceRoleKey,
      fetch: options.fetch,
    }) as SupabaseRuntimeConfig,
  );
  const routes = factories.createRoutes(
    omitUndefined({
      apiKey: config.lifiApiKey,
      baseUrl: config.lifiBaseUrl,
      integrator: "agentpay",
      fetch: options.fetch,
    }) as LifiRouteQuoteProviderConfig,
  );
  const chainAdapters = factories.createChainAdapters({
    rpcUrl: config.xlayerRpcUrl,
    rpcUrls: config.xlayerRpcUrls,
    executorPrivateKey: config.executorPrivateKey,
  });
  const executorAddress = options.executorAddress ?? new Wallet(config.executorPrivateKey).address;

  return {
    prepareWalletCreation: createPrepareWalletCreationHandler(
      omitUndefined({
        setupIntents: repositories.setupIntents,
        executorAddress,
        setupWebUrl: config.setupWebUrl ?? DEFAULT_SETUP_WEB_URL,
        clock,
        createSetupIntentId: options.createSetupIntentId ?? (() => createSetupIntentId()),
        homeChainId: config.homeChainId,
        setupTtlSeconds: options.setupTtlSeconds,
      }) as PrepareWalletCreationDependencies,
    ),
    checkWalletCreation: createCheckWalletCreationHandler({
      setupIntents: repositories.setupIntents,
      clock,
    }),
    getAgentWallet: createGetAgentWalletHandler({
      wallets: repositories.wallets,
      homeChainId: config.homeChainId,
    } satisfies GetAgentWalletDependencies),
    getBalance: createGetBalanceHandler({
      wallets: repositories.wallets,
      tokenBalances: chainAdapters.tokenBalances,
      nativeBalances: chainAdapters.nativeBalances,
      homeChainId: config.homeChainId,
    }),
    parseInvoicePayment: createParseInvoicePaymentHandler(),
    parseX402PaymentRequired: createParseX402PaymentRequiredHandler(),
    retryX402Request: createRetryX402RequestHandler({
      paymentIntents: repositories.paymentIntents,
      fetch: options.x402Fetch ?? options.fetch ?? fetch,
    }),
    prepareContractCall: createPrepareContractCallHandler(
      omitUndefined({
        wallets: repositories.wallets,
        balances: chainAdapters.balances,
        paymentIntents: repositories.paymentIntents,
        clock,
        createId: options.createId ?? (() => createPaymentIntentId()),
        createNonce: options.createNonce ?? (() => createPaymentNonce()),
        homeChainId: config.homeChainId,
        approvalTtlSeconds: options.approvalTtlSeconds,
      }) as PrepareContractCallDependencies,
    ),
    quotePaymentRoute: createQuotePaymentRouteHandler({
      wallets: repositories.wallets,
      routes,
      balances: chainAdapters.balances,
      homeChainId: config.homeChainId,
    } satisfies QuotePaymentRouteDependencies),
    checkRouteTargetAllowance: createCheckRouteTargetAllowanceHandler({
      wallets: repositories.wallets,
      routeTargetAllowances: chainAdapters.routeTargetAllowances,
      homeChainId: config.homeChainId,
    } satisfies CheckRouteTargetAllowanceDependencies),
    prepareAccountAdminTransaction: createPrepareAccountAdminTransactionHandler({
      wallets: repositories.wallets,
      homeChainId: config.homeChainId,
    } satisfies PrepareAccountAdminTransactionDependencies),
    prepareRouteTargetAllowance: createPrepareRouteTargetAllowanceHandler({
      wallets: repositories.wallets,
      homeChainId: config.homeChainId,
    } satisfies PrepareRouteTargetAllowanceDependencies),
    preparePayment: createPreparePaymentHandler(
      omitUndefined({
        wallets: repositories.wallets,
        routes,
        balances: chainAdapters.balances,
        paymentIntents: repositories.paymentIntents,
        clock,
        createId: options.createId ?? (() => createPaymentIntentId()),
        createNonce: options.createNonce ?? (() => createPaymentNonce()),
        homeChainId: config.homeChainId,
        approvalTtlSeconds: options.approvalTtlSeconds,
      }) as PreparePaymentDependencies,
    ),
    executePayment: createExecutePaymentHandler({
      paymentIntents: repositories.paymentIntents,
      balances: chainAdapters.balances,
      executor: chainAdapters.executor,
      clock,
    }),
    trackPayment: createTrackPaymentHandler({
      paymentIntents: repositories.paymentIntents,
      routeStatuses: routes,
      sourceTransactions: chainAdapters.sourceTransactions,
      clock,
    }),
    listTransactions: createListTransactionsHandler({
      paymentIntents: repositories.paymentIntents,
    }),
    listPaymentEvents: createListPaymentEventsHandler({
      paymentEvents: repositories.paymentEvents,
    }),
  };
}

export function createPaymentIntentId(randomByteSource: (size: number) => Uint8Array = randomBytes): string {
  return `pay_${Buffer.from(randomByteSource(12)).toString("hex")}`;
}

export function createPaymentNonce(randomByteSource: (size: number) => Uint8Array = randomBytes): string {
  return BigInt(`0x${Buffer.from(randomByteSource(16)).toString("hex")}`).toString();
}

export function createSetupIntentId(randomByteSource: (size: number) => Uint8Array = randomBytes): string {
  return `setup_${Buffer.from(randomByteSource(12)).toString("hex")}`;
}

const defaultAgentPayRuntimeFactories: AgentPayRuntimeFactories = {
  createRepositories: createSupabaseAgentPayRepositoriesFromConfig,
  createRoutes(config) {
    return {
      ...createLifiRouteQuoteProvider(config),
      ...createLifiRouteStatusProvider(config),
    };
  },
  createChainAdapters: createEthersRuntimeAdapters,
};

function createConfigErrorMessage(missing: string[], invalid: string[]): string {
  const parts = [
    missing.length > 0 ? `missing: ${missing.join(", ")}` : undefined,
    invalid.length > 0 ? `invalid: ${invalid.join(", ")}` : undefined,
  ].filter(Boolean);

  return `Invalid AgentPay runtime environment (${parts.join("; ")}).`;
}

function isHttpUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return url.protocol === "http:" || url.protocol === "https:";
  } catch {
    return false;
  }
}

function parseOptionalHomeChainId(value: string | undefined): number | undefined {
  if (!value) {
    return undefined;
  }

  const parsed = Number(value);
  return Number.isInteger(parsed) && setupHomeChainIds.has(parsed) ? parsed : undefined;
}

function parseXLayerRpcUrls(env: Record<string, string | undefined>): Partial<Record<number, string>> | undefined {
  const rpcUrls = omitUndefined({
    196: env.XLAYER_MAINNET_RPC_URL,
    1952: env.XLAYER_TESTNET_RPC_URL,
  }) as Partial<Record<number, string>>;

  return Object.keys(rpcUrls).length > 0 ? rpcUrls : undefined;
}

function parseStableTokenOverrides(env: Record<string, string | undefined>): StableTokenMetadataOverrides | undefined {
  const xlayerOverrides = {
    ...(env.AGENTPAY_XLAYER_USDT0_ADDRESS
      ? {
          USDT0: {
            address: env.AGENTPAY_XLAYER_USDT0_ADDRESS,
          },
        }
      : {}),
    ...(env.AGENTPAY_XLAYER_USDC_ADDRESS
      ? {
          USDC: {
            address: env.AGENTPAY_XLAYER_USDC_ADDRESS,
          },
        }
      : {}),
  };
  const xlayerTestnetOverrides = {
    ...(env.AGENTPAY_XLAYER_TESTNET_USDT0_ADDRESS
      ? {
          USDT0: {
            address: env.AGENTPAY_XLAYER_TESTNET_USDT0_ADDRESS,
          },
        }
      : {}),
    ...(env.AGENTPAY_XLAYER_TESTNET_USDC_ADDRESS
      ? {
          USDC: {
            address: env.AGENTPAY_XLAYER_TESTNET_USDC_ADDRESS,
          },
        }
      : {}),
    ...(env.AGENTPAY_XLAYER_TESTNET_USDT_ADDRESS
      ? {
          USDT: {
            address: env.AGENTPAY_XLAYER_TESTNET_USDT_ADDRESS,
          },
        }
      : {}),
  };

  const overrides = omitUndefined({
    196: Object.keys(xlayerOverrides).length > 0 ? xlayerOverrides : undefined,
    1952: Object.keys(xlayerTestnetOverrides).length > 0 ? xlayerTestnetOverrides : undefined,
  }) as StableTokenMetadataOverrides;

  return Object.keys(overrides).length > 0 ? overrides : undefined;
}

function validateStableTokenOverrideAddresses(env: Record<string, string | undefined>): string[] {
  return [
    "AGENTPAY_XLAYER_USDT0_ADDRESS",
    "AGENTPAY_XLAYER_USDC_ADDRESS",
    "AGENTPAY_XLAYER_TESTNET_USDT0_ADDRESS",
    "AGENTPAY_XLAYER_TESTNET_USDC_ADDRESS",
    "AGENTPAY_XLAYER_TESTNET_USDT_ADDRESS",
  ].filter((name) => env[name] && !addressPattern.test(env[name]));
}

function omitUndefined<T extends Record<string, unknown>>(record: T): Partial<T> {
  return Object.fromEntries(Object.entries(record).filter(([, value]) => value !== undefined)) as Partial<T>;
}
