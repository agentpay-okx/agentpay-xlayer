import { createClient } from "@supabase/supabase-js";
import type { PaymentEventRecord, PaymentIntentRecord, SetupIntentRecord } from "@agentpay-ai/shared";

import type { ExecutePaymentIntentRepository } from "../tools/execute-payment.ts";
import type {
  ListPaymentEventRepository,
  ListPaymentIntentRepository,
  TrackPaymentIntentRepository,
} from "../tools/payment-tracking.ts";
import type { AgentWallet, AgentWalletRepository, PaymentIntentRepository } from "../tools/prepare-payment.ts";
import type { SetupIntentRepository } from "../tools/wallet-setup.ts";

interface SupabaseQueryResult<T> {
  data: T | null;
  error: { message: string } | null;
}

interface SupabaseListQueryResult<T> {
  data: T[] | null;
  error: { message: string } | null;
}

interface SupabaseSelectQuery<T> extends PromiseLike<SupabaseListQueryResult<T>> {
  select(columns: string): SupabaseSelectQuery<T>;
  eq(column: string, value: string | number): SupabaseSelectQuery<T>;
  order(column: string, options: { ascending: boolean }): SupabaseSelectQuery<T>;
  limit(count: number): SupabaseSelectQuery<T>;
  maybeSingle(): Promise<SupabaseQueryResult<T>>;
}

interface SupabaseInsertQuery {
  insert(row: Record<string, unknown>): Promise<{ error: { message: string } | null }>;
}

interface SupabaseUpdateBuilder<T> extends PromiseLike<{ error: { message: string } | null }> {
  eq(column: string, value: string): SupabaseUpdateBuilder<T>;
  select(columns: string): SupabaseUpdateBuilder<T>;
  maybeSingle(): Promise<SupabaseQueryResult<T>>;
}

interface SupabaseUpdateQuery<T> {
  update(row: Record<string, unknown>): SupabaseUpdateBuilder<T>;
}

export interface AgentPaySupabaseClient {
  from(table: "setup_intents"): SupabaseInsertQuery & SupabaseSelectQuery<SetupIntentRow> & SupabaseUpdateQuery<SetupIntentRow>;
  from(table: "agent_wallets"): SupabaseInsertQuery & SupabaseSelectQuery<AgentWalletRow>;
  from(table: "payment_intents"): SupabaseInsertQuery & SupabaseSelectQuery<PaymentIntentRow> & SupabaseUpdateQuery<PaymentIntentRow>;
  from(table: "payment_events"): SupabaseInsertQuery & SupabaseSelectQuery<PaymentEventRow>;
}

interface AgentWalletRow {
  owner_address: string;
  account_address: string;
  home_chain_id: number;
  executor_address: string;
  status: "ACTIVE" | "PAUSED" | "CLOSED";
}

interface PaymentIntentRow {
  id: string;
  account_address: string;
  owner_address: string;
  status: PaymentIntentRecord["status"];
  payment_type: PaymentIntentRecord["paymentType"];
  source_chain_id: number;
  destination_chain_id: number;
  source_token_address: string;
  source_token_symbol: string;
  destination_token_address: string;
  destination_token_symbol: string;
  recipient_address: string;
  amount_out: string;
  max_amount_in: string;
  max_native_fee: string;
  route_provider: PaymentIntentRecord["routeProvider"];
  route_target: string;
  route_calldata: string;
  route_calldata_hash: string;
  route_summary: string;
  estimated_fee: string | null;
  estimated_eta_seconds: number | null;
  nonce: string;
  deadline: string;
  purpose: string | null;
  approval_phrase: string;
  approved_at: string | null;
  source_tx_hash: string | null;
  destination_tx_hash: string | null;
  lifi_tracking_id: string | null;
  error_code: string | null;
  error_message: string | null;
  completed_at?: string | null;
  created_at?: string;
}

interface PaymentEventRow {
  id: string;
  payment_intent_id: string;
  event_type: string;
  message: string | null;
  metadata: Record<string, unknown> | null;
  created_at: string;
}

interface SetupIntentRow {
  id: string;
  owner_address: string | null;
  executor_address: string;
  message_to_sign: string;
  signature: string | null;
  status: "PENDING" | "SIGNED" | "DEPLOYING" | "COMPLETED" | "EXPIRED" | "FAILED";
  expires_at: string;
  account_address: string | null;
  error_code: string | null;
  error_message: string | null;
  completed_at: string | null;
  home_chain_id: number | null;
}

export interface SupabaseRuntimeConfig {
  supabaseUrl: string;
  serviceRoleKey: string;
  fetch?: typeof fetch;
}

export function createSupabaseAgentPayRepositoriesFromConfig(config: SupabaseRuntimeConfig) {
  const client = createClient(config.supabaseUrl, config.serviceRoleKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
    global: config.fetch
      ? {
          fetch: config.fetch,
        }
      : undefined,
  });

  return createSupabaseAgentPayRepositories(client as unknown as AgentPaySupabaseClient);
}

export function createSupabaseAgentPayRepositories(client: AgentPaySupabaseClient): {
  wallets: AgentWalletRepository & { createAgentWallet(wallet: AgentWallet): Promise<void> };
  setupIntents: SetupIntentRepository & {
    markSetupSigned(setupIntentId: string, ownerAddress: string, signature: string): Promise<void>;
    markSetupCompleted(setupIntentId: string, accountAddress: string, completedAt: string): Promise<void>;
    markSetupExpired(setupIntentId: string): Promise<void>;
    markSetupFailed(setupIntentId: string, errorCode: string, errorMessage: string): Promise<void>;
  };
  paymentIntents: PaymentIntentRepository &
    ExecutePaymentIntentRepository &
    TrackPaymentIntentRepository &
    ListPaymentIntentRepository;
  paymentEvents: ListPaymentEventRepository;
} {
  return {
    setupIntents: {
      async createSetupIntent(intent): Promise<void> {
        const { error } = await client.from("setup_intents").insert(toSetupIntentRow(intent));

        if (error) {
          throw new Error(`Failed to create setup intent ${intent.id}: ${error.message}`);
        }
      },
      async getSetupIntent(setupIntentId): Promise<SetupIntentRecord | null> {
        const { data, error } = await client.from("setup_intents").select("*").eq("id", setupIntentId).maybeSingle();

        if (error) {
          throw new Error(`Failed to load setup intent ${setupIntentId}: ${error.message}`);
        }

        return data ? toSetupIntentRecord(data) : null;
      },
      async markSetupSigned(setupIntentId, ownerAddress, signature): Promise<void> {
        await updateSetupIntent(client, setupIntentId, {
          status: "SIGNED",
          owner_address: ownerAddress,
          signature,
        });
      },
      async markSetupCompleted(setupIntentId, accountAddress, completedAt): Promise<void> {
        await updateSetupIntent(client, setupIntentId, {
          status: "COMPLETED",
          account_address: accountAddress,
          completed_at: completedAt,
        });
      },
      async markSetupExpired(setupIntentId): Promise<void> {
        await updateSetupIntent(client, setupIntentId, {
          status: "EXPIRED",
          error_code: "SETUP_EXPIRED",
          error_message: "Wallet setup intent expired.",
        });
      },
      async markSetupFailed(setupIntentId, errorCode, errorMessage): Promise<void> {
        await updateSetupIntent(client, setupIntentId, {
          status: "FAILED",
          error_code: errorCode,
          error_message: errorMessage,
        });
      },
    },
    wallets: {
      async getActiveWallet(request = {}): Promise<AgentWallet | null> {
        let query = client
          .from("agent_wallets")
          .select("owner_address, account_address, home_chain_id, executor_address, status")
          .eq("status", "ACTIVE");

        if (request.homeChainId !== undefined) {
          query = query.eq("home_chain_id", request.homeChainId);
        }

        const { data, error } = await query
          .order("created_at", { ascending: false })
          .limit(1)
          .maybeSingle();

        if (error) {
          throw new Error(`Failed to load active AgentPay wallet: ${error.message}`);
        }

        return data ? toAgentWallet(data) : null;
      },
      async createAgentWallet(wallet): Promise<void> {
        const { error } = await client.from("agent_wallets").insert(toAgentWalletRow(wallet));

        if (error) {
          throw new Error(`Failed to create AgentPay wallet ${wallet.accountAddress}: ${error.message}`);
        }
      },
    },
    paymentIntents: {
      async createPaymentIntent(intent: PaymentIntentRecord): Promise<void> {
        const { error } = await client.from("payment_intents").insert(toPaymentIntentRow(intent));

        if (error) {
          throw new Error(`Failed to create payment intent ${intent.id}: ${error.message}`);
        }

        await insertPaymentEvent(client, intent.id, "PAYMENT_CREATED", "Payment intent created.", {
          status: intent.status,
          amountOut: intent.amountOut,
          destinationChainId: intent.destinationChainId,
          destinationTokenSymbol: intent.destinationTokenSymbol,
          recipientAddress: intent.recipientAddress,
        });
      },
      async getPaymentIntent(paymentIntentId: string): Promise<PaymentIntentRecord | null> {
        const { data, error } = await client.from("payment_intents").select("*").eq("id", paymentIntentId).maybeSingle();

        if (error) {
          throw new Error(`Failed to load payment intent ${paymentIntentId}: ${error.message}`);
        }

        return data ? toPaymentIntentRecord(data) : null;
      },
      async claimPaymentApproval(paymentIntentId: string, approvedAt: string): Promise<boolean> {
        const { data, error } = await client
          .from("payment_intents")
          .update({
            status: "APPROVED",
            approved_at: approvedAt,
          })
          .eq("id", paymentIntentId)
          .eq("status", "AWAITING_APPROVAL")
          .select("id")
          .maybeSingle();

        if (error) {
          throw new Error(`Failed to claim payment intent ${paymentIntentId}: ${error.message}`);
        }

        if (!data) {
          return false;
        }

        await insertPaymentEvent(client, paymentIntentId, "PAYMENT_APPROVED", "Exact approval phrase accepted.", {
          approvedAt,
        });

        return true;
      },
      async markPaymentExecuting(paymentIntentId: string, sourceTxHash: string, approvedAt: string): Promise<void> {
        await updatePaymentIntent(client, paymentIntentId, {
          status: "EXECUTING",
          source_tx_hash: sourceTxHash,
          approved_at: approvedAt,
        });
        await insertPaymentEvent(client, paymentIntentId, "PAYMENT_EXECUTING", "Payment execution started.", {
          sourceTxHash,
          approvedAt,
        });
      },
      async markPaymentFailed(paymentIntentId: string, errorCode: string, errorMessage: string): Promise<void> {
        await updatePaymentIntent(client, paymentIntentId, {
          status: "FAILED",
          error_code: errorCode,
          error_message: errorMessage,
        });
        await insertPaymentEvent(client, paymentIntentId, "PAYMENT_FAILED", errorMessage, {
          errorCode,
        });
      },
      async markPaymentExpired(paymentIntentId: string): Promise<void> {
        const errorMessage = "Payment approval deadline expired.";

        await updatePaymentIntent(client, paymentIntentId, {
          status: "EXPIRED",
          error_code: "DEADLINE_EXPIRED",
          error_message: errorMessage,
        });
        await insertPaymentEvent(client, paymentIntentId, "PAYMENT_EXPIRED", errorMessage, {
          errorCode: "DEADLINE_EXPIRED",
        });
      },
      async markPaymentCompleted(
        paymentIntentId: string,
        destinationTxHash: string | undefined,
        completedAt: string,
      ): Promise<void> {
        await updatePaymentIntent(
          client,
          paymentIntentId,
          omitUndefined({
            status: "COMPLETED",
            destination_tx_hash: destinationTxHash,
            completed_at: completedAt,
          }),
        );
        await insertPaymentEvent(client, paymentIntentId, "PAYMENT_COMPLETED", "Payment completed.", {
          destinationTxHash,
          completedAt,
        });
      },
      async listPaymentIntents(request: { limit: number }): Promise<PaymentIntentRecord[]> {
        const { data, error } = await client
          .from("payment_intents")
          .select("*")
          .order("created_at", { ascending: false })
          .limit(request.limit);

        if (error) {
          throw new Error(`Failed to list payment intents: ${error.message}`);
        }

        return (data ?? []).map(toPaymentIntentRecord);
      },
    },
    paymentEvents: {
      async listPaymentEvents(request: { paymentIntentId: string; limit: number }): Promise<PaymentEventRecord[]> {
        const { data, error } = await client
          .from("payment_events")
          .select("*")
          .eq("payment_intent_id", request.paymentIntentId)
          .order("created_at", { ascending: false })
          .limit(request.limit);

        if (error) {
          throw new Error(`Failed to list payment events for ${request.paymentIntentId}: ${error.message}`);
        }

        return (data ?? []).map(toPaymentEventRecord);
      },
    },
  };
}

function toSetupIntentRow(intent: SetupIntentRecord): Record<string, unknown> {
  return omitUndefined({
    id: intent.id,
    owner_address: intent.ownerAddress,
    executor_address: intent.executorAddress,
    message_to_sign: intent.messageToSign,
    signature: intent.signature,
    status: intent.status,
    expires_at: intent.expiresAt,
    account_address: intent.accountAddress,
    error_code: intent.errorCode,
    error_message: intent.errorMessage,
    completed_at: intent.completedAt,
    home_chain_id: intent.homeChainId,
  });
}

function toSetupIntentRecord(row: SetupIntentRow): SetupIntentRecord {
  return {
    id: row.id,
    ownerAddress: row.owner_address ?? undefined,
    executorAddress: row.executor_address,
    messageToSign: row.message_to_sign,
    signature: row.signature ?? undefined,
    status: row.status,
    expiresAt: row.expires_at,
    accountAddress: row.account_address ?? undefined,
    errorCode: row.error_code ?? undefined,
    errorMessage: row.error_message ?? undefined,
    completedAt: row.completed_at ?? undefined,
    homeChainId: row.home_chain_id ?? undefined,
  };
}

function toAgentWallet(row: AgentWalletRow): AgentWallet {
  return {
    ownerAddress: row.owner_address,
    accountAddress: row.account_address,
    homeChainId: row.home_chain_id,
    executorAddress: row.executor_address,
    status: row.status,
  };
}

function toAgentWalletRow(wallet: AgentWallet): Record<string, unknown> {
  return {
    owner_address: wallet.ownerAddress,
    account_address: wallet.accountAddress,
    home_chain_id: wallet.homeChainId,
    executor_address: wallet.executorAddress,
    status: wallet.status,
  };
}

export function toPaymentIntentRow(intent: PaymentIntentRecord): Record<string, unknown> {
  return omitUndefined({
    id: intent.id,
    account_address: intent.accountAddress,
    owner_address: intent.ownerAddress,
    status: intent.status,
    payment_type: intent.paymentType,
    source_chain_id: intent.sourceChainId,
    destination_chain_id: intent.destinationChainId,
    source_token_address: intent.sourceTokenAddress,
    source_token_symbol: intent.sourceTokenSymbol,
    destination_token_address: intent.destinationTokenAddress,
    destination_token_symbol: intent.destinationTokenSymbol,
    recipient_address: intent.recipientAddress,
    amount_out: intent.amountOut,
    max_amount_in: intent.maxAmountIn,
    max_native_fee: intent.maxNativeFee,
    route_provider: intent.routeProvider,
    route_target: intent.routeTarget,
    route_calldata: intent.routeCalldata,
    route_calldata_hash: intent.routeCalldataHash,
    route_summary: intent.routeSummary,
    estimated_fee: intent.estimatedFee,
    estimated_eta_seconds: intent.estimatedEtaSeconds,
    nonce: intent.nonce,
    deadline: intent.deadline,
    purpose: intent.purpose,
    approval_phrase: intent.approvalPhrase,
    approved_at: intent.approvedAt,
    source_tx_hash: intent.sourceTxHash,
    destination_tx_hash: intent.destinationTxHash,
    lifi_tracking_id: intent.lifiTrackingId,
    error_code: intent.errorCode,
    error_message: intent.errorMessage,
    completed_at: intent.completedAt,
  });
}

function toPaymentIntentRecord(row: PaymentIntentRow): PaymentIntentRecord {
  return {
    id: row.id,
    accountAddress: row.account_address,
    ownerAddress: row.owner_address,
    status: row.status,
    paymentType: row.payment_type,
    sourceChainId: row.source_chain_id,
    destinationChainId: row.destination_chain_id,
    sourceTokenAddress: row.source_token_address,
    sourceTokenSymbol: row.source_token_symbol,
    destinationTokenAddress: row.destination_token_address,
    destinationTokenSymbol: row.destination_token_symbol,
    recipientAddress: row.recipient_address,
    amountOut: row.amount_out,
    maxAmountIn: row.max_amount_in,
    maxNativeFee: row.max_native_fee,
    routeProvider: row.route_provider,
    routeTarget: row.route_target,
    routeCalldata: row.route_calldata,
    routeCalldataHash: row.route_calldata_hash,
    routeSummary: row.route_summary,
    estimatedFee: row.estimated_fee ?? undefined,
    estimatedEtaSeconds: row.estimated_eta_seconds ?? undefined,
    nonce: row.nonce,
    deadline: row.deadline,
    purpose: row.purpose ?? "",
    approvalPhrase: row.approval_phrase,
    approvedAt: row.approved_at ?? undefined,
    sourceTxHash: row.source_tx_hash ?? undefined,
    destinationTxHash: row.destination_tx_hash ?? undefined,
    lifiTrackingId: row.lifi_tracking_id ?? undefined,
    errorCode: row.error_code ?? undefined,
    errorMessage: row.error_message ?? undefined,
    createdAt: row.created_at,
    completedAt: row.completed_at ?? undefined,
  };
}

function toPaymentEventRecord(row: PaymentEventRow): PaymentEventRecord {
  return {
    id: row.id,
    paymentIntentId: row.payment_intent_id,
    eventType: row.event_type,
    message: row.message ?? undefined,
    metadata: row.metadata ?? {},
    createdAt: row.created_at,
  };
}

async function updatePaymentIntent(
  client: AgentPaySupabaseClient,
  paymentIntentId: string,
  row: Record<string, unknown>,
): Promise<void> {
  const { error } = await client.from("payment_intents").update(row).eq("id", paymentIntentId);

  if (error) {
    throw new Error(`Failed to update payment intent ${paymentIntentId}: ${error.message}`);
  }
}

async function insertPaymentEvent(
  client: AgentPaySupabaseClient,
  paymentIntentId: string,
  eventType: string,
  message: string,
  metadata: Record<string, unknown>,
): Promise<void> {
  const { error } = await client.from("payment_events").insert({
    payment_intent_id: paymentIntentId,
    event_type: eventType,
    message,
    metadata: omitUndefined(metadata),
  });

  if (error) {
    throw new Error(`Failed to create payment event for ${paymentIntentId}: ${error.message}`);
  }
}

async function updateSetupIntent(
  client: AgentPaySupabaseClient,
  setupIntentId: string,
  row: Record<string, unknown>,
): Promise<void> {
  const { error } = await client.from("setup_intents").update(row).eq("id", setupIntentId);

  if (error) {
    throw new Error(`Failed to update setup intent ${setupIntentId}: ${error.message}`);
  }
}

function omitUndefined(record: Record<string, unknown>): Record<string, unknown> {
  return Object.fromEntries(Object.entries(record).filter(([, value]) => value !== undefined));
}
