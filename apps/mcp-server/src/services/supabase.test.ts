import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  type AgentPaySupabaseClient,
  createSupabaseAgentPayRepositories,
  toPaymentIntentRow,
} from "./supabase.ts";

class FakeSelectQuery {
  public calls: Array<[string, unknown[]]> = [];

  select(columns: string) {
    this.calls.push(["select", [columns]]);
    return this;
  }

  eq(column: string, value: string) {
    this.calls.push(["eq", [column, value]]);
    return this;
  }

  order(column: string, options: { ascending: boolean }) {
    this.calls.push(["order", [column, options]]);
    return this;
  }

  limit(count: number) {
    this.calls.push(["limit", [count]]);
    return this;
  }

  maybeSingle() {
    this.calls.push(["maybeSingle", []]);
    return Promise.resolve({
      data: {
        owner_address: "0x2222222222222222222222222222222222222222",
        account_address: "0x3333333333333333333333333333333333333333",
        home_chain_id: 196,
        executor_address: "0x4444444444444444444444444444444444444444",
        status: "ACTIVE" as const,
      },
      error: null,
    });
  }
}

class FakeAgentWalletMutationQuery extends FakeSelectQuery {
  public inserted: unknown;

  insert(row: unknown) {
    this.inserted = row;
    return Promise.resolve({ error: null });
  }
}

class FakeInsertQuery {
  public inserted: unknown;

  insert(row: unknown) {
    this.inserted = row;
    return Promise.resolve({ error: null });
  }
}

class FakePaymentEventQuery {
  public calls: Array<[string, unknown[]]> = [];
  public data: unknown[] = [];
  public inserted: unknown[] = [];

  insert(row: unknown) {
    this.inserted.push(row);
    return Promise.resolve({ error: null });
  }

  select(columns: string) {
    this.calls.push(["select", [columns]]);
    return this;
  }

  eq(column: string, value: string) {
    this.calls.push(["eq", [column, value]]);
    return this;
  }

  order(column: string, options: { ascending: boolean }) {
    this.calls.push(["order", [column, options]]);
    return this;
  }

  limit(count: number) {
    this.calls.push(["limit", [count]]);
    return this;
  }

  then(resolve: (value: { data: unknown[]; error: null }) => void) {
    this.calls.push(["then", []]);
    resolve({ data: this.data, error: null });
  }
}

class FakePaymentIntentQuery {
  public calls: Array<[string, unknown[]]> = [];
  public inserted: unknown;
  public updated: unknown;
  public maybeSingleData: unknown | null | undefined;

  select(columns: string) {
    this.calls.push(["select", [columns]]);
    return this;
  }

  insert(row: unknown) {
    this.inserted = row;
    return Promise.resolve({ error: null });
  }

  update(row: unknown) {
    this.updated = row;
    this.calls.push(["update", [row]]);
    return this;
  }

  eq(column: string, value: string) {
    this.calls.push(["eq", [column, value]]);
    return this;
  }

  maybeSingle() {
    this.calls.push(["maybeSingle", []]);
    const data =
      this.maybeSingleData === undefined
        ? {
            id: "pay_123",
            account_address: "0x3333333333333333333333333333333333333333",
            owner_address: "0x2222222222222222222222222222222222222222",
            status: "AWAITING_APPROVAL",
            payment_type: "WALLET_PAYMENT",
            source_chain_id: 196,
            destination_chain_id: 8453,
            source_token_address: "0x5555555555555555555555555555555555555555",
            source_token_symbol: "USDT0",
            destination_token_address: "0x6666666666666666666666666666666666666666",
            destination_token_symbol: "USDC",
            recipient_address: "0x1111111111111111111111111111111111111111",
            amount_out: "10",
            max_amount_in: "10.18",
            max_native_fee: "0",
            route_provider: "LI.FI",
            route_target: "0x7777777777777777777777777777777777777777",
            route_calldata: "0x1234",
            route_calldata_hash: "0x56570de287d73cd1cb6092bb8fdee6173974955fdef345ae579ee9f475ea7432",
            route_summary: "Swap and bridge.",
            estimated_fee: "0.12",
            estimated_eta_seconds: 120,
            nonce: "42",
            deadline: "2026-07-02T14:45:00.000Z",
            purpose: "design bounty",
            approval_phrase: "APPROVE pay_123",
            approved_at: null,
            source_tx_hash: null,
            destination_tx_hash: null,
            lifi_tracking_id: null,
            error_code: null,
            error_message: null,
            created_at: "2026-07-02T14:30:00.000Z",
          }
        : this.maybeSingleData;

    return Promise.resolve({
      data,
      error: null,
    });
  }

  then(resolve: (value: { error: null }) => void) {
    resolve({ error: null });
  }
}

class FakePaymentIntentListQuery {
  public calls: Array<[string, unknown[]]> = [];
  public data: unknown[] = [];

  select(columns: string) {
    this.calls.push(["select", [columns]]);
    return this;
  }

  order(column: string, options: { ascending: boolean }) {
    this.calls.push(["order", [column, options]]);
    return this;
  }

  limit(count: number) {
    this.calls.push(["limit", [count]]);
    return this;
  }

  then(resolve: (value: { data: unknown[]; error: null }) => void) {
    this.calls.push(["then", []]);
    resolve({ data: this.data, error: null });
  }
}

class FakeSetupIntentQuery {
  public calls: Array<[string, unknown[]]> = [];
  public inserted: unknown;
  public updated: unknown;

  select(columns: string) {
    this.calls.push(["select", [columns]]);
    return this;
  }

  insert(row: unknown) {
    this.inserted = row;
    return Promise.resolve({ error: null });
  }

  update(row: unknown) {
    this.updated = row;
    this.calls.push(["update", [row]]);
    return this;
  }

  eq(column: string, value: string) {
    this.calls.push(["eq", [column, value]]);
    return this;
  }

  maybeSingle() {
    this.calls.push(["maybeSingle", []]);
    return Promise.resolve({
      data: {
        id: "setup_123",
        owner_address: "0x2222222222222222222222222222222222222222",
        executor_address: "0x4444444444444444444444444444444444444444",
        message_to_sign: "AgentPay wallet setup",
        signature: null,
        status: "COMPLETED",
        expires_at: "2026-07-03T04:15:00.000Z",
        account_address: "0x3333333333333333333333333333333333333333",
        error_code: null,
        error_message: null,
        completed_at: "2026-07-03T04:02:00.000Z",
        home_chain_id: 196,
      },
      error: null,
    });
  }
}

describe("createSupabaseAgentPayRepositories", () => {
  it("loads the latest active wallet from agent_wallets", async () => {
    const query = new FakeSelectQuery();
    const client = {
      from(table: string) {
        assert.equal(table, "agent_wallets");
        return query;
      },
    };

    const repositories = createSupabaseAgentPayRepositories(client as unknown as AgentPaySupabaseClient);
    const wallet = await repositories.wallets.getActiveWallet();

    assert.deepEqual(wallet, {
      ownerAddress: "0x2222222222222222222222222222222222222222",
      accountAddress: "0x3333333333333333333333333333333333333333",
      homeChainId: 196,
      executorAddress: "0x4444444444444444444444444444444444444444",
      status: "ACTIVE",
    });
    assert.deepEqual(query.calls, [
      ["select", ["owner_address, account_address, home_chain_id, executor_address, status"]],
      ["eq", ["status", "ACTIVE"]],
      ["order", ["created_at", { ascending: false }]],
      ["limit", [1]],
      ["maybeSingle", []],
    ]);
  });

  it("loads the latest active wallet for a requested X Layer network", async () => {
    const query = new FakeSelectQuery();
    const client = {
      from(table: string) {
        assert.equal(table, "agent_wallets");
        return query;
      },
    };

    const repositories = createSupabaseAgentPayRepositories(client as unknown as AgentPaySupabaseClient);
    await repositories.wallets.getActiveWallet({ homeChainId: 1952 });

    assert.deepEqual(query.calls, [
      ["select", ["owner_address, account_address, home_chain_id, executor_address, status"]],
      ["eq", ["status", "ACTIVE"]],
      ["eq", ["home_chain_id", 1952]],
      ["order", ["created_at", { ascending: false }]],
      ["limit", [1]],
      ["maybeSingle", []],
    ]);
  });

  it("maps payment intent records to payment_intents insert rows", async () => {
    const query = new FakeInsertQuery();
    const eventQuery = new FakePaymentEventQuery();
    const client = {
      from(table: string) {
        if (table === "payment_events") {
          return eventQuery;
        }

        assert.equal(table, "payment_intents");
        return query;
      },
    };

    const repositories = createSupabaseAgentPayRepositories(client as unknown as AgentPaySupabaseClient);
    await repositories.paymentIntents.createPaymentIntent({
      id: "pay_123",
      accountAddress: "0x3333333333333333333333333333333333333333",
      ownerAddress: "0x2222222222222222222222222222222222222222",
      status: "AWAITING_APPROVAL",
      paymentType: "WALLET_PAYMENT",
      sourceChainId: 196,
      destinationChainId: 8453,
      sourceTokenAddress: "0x5555555555555555555555555555555555555555",
      sourceTokenSymbol: "USDT0",
      destinationTokenAddress: "0x6666666666666666666666666666666666666666",
      destinationTokenSymbol: "USDC",
      recipientAddress: "0x1111111111111111111111111111111111111111",
      amountOut: "10",
      maxAmountIn: "10.18",
      maxNativeFee: "0",
      routeProvider: "LI.FI",
      routeTarget: "0x7777777777777777777777777777777777777777",
      routeCalldata: "0x1234",
      routeCalldataHash: "0x56570de287d73cd1cb6092bb8fdee6173974955fdef345ae579ee9f475ea7432",
      routeSummary: "Swap and bridge.",
      estimatedFee: "0.12",
      estimatedEtaSeconds: 120,
      nonce: "42",
      deadline: "2026-07-02T14:45:00.000Z",
      purpose: "design bounty",
      approvalPhrase: "APPROVE pay_123",
    });

    assert.deepEqual(query.inserted, {
      id: "pay_123",
      account_address: "0x3333333333333333333333333333333333333333",
      owner_address: "0x2222222222222222222222222222222222222222",
      status: "AWAITING_APPROVAL",
      payment_type: "WALLET_PAYMENT",
      source_chain_id: 196,
      destination_chain_id: 8453,
      source_token_address: "0x5555555555555555555555555555555555555555",
      source_token_symbol: "USDT0",
      destination_token_address: "0x6666666666666666666666666666666666666666",
      destination_token_symbol: "USDC",
      recipient_address: "0x1111111111111111111111111111111111111111",
      amount_out: "10",
      max_amount_in: "10.18",
      max_native_fee: "0",
      route_provider: "LI.FI",
      route_target: "0x7777777777777777777777777777777777777777",
      route_calldata: "0x1234",
      route_calldata_hash: "0x56570de287d73cd1cb6092bb8fdee6173974955fdef345ae579ee9f475ea7432",
      route_summary: "Swap and bridge.",
      estimated_fee: "0.12",
      estimated_eta_seconds: 120,
      nonce: "42",
      deadline: "2026-07-02T14:45:00.000Z",
      purpose: "design bounty",
      approval_phrase: "APPROVE pay_123",
    });
    assert.deepEqual(eventQuery.inserted, [
      {
        payment_intent_id: "pay_123",
        event_type: "PAYMENT_CREATED",
        message: "Payment intent created.",
        metadata: {
          status: "AWAITING_APPROVAL",
          amountOut: "10",
          destinationChainId: 8453,
          destinationTokenSymbol: "USDC",
          recipientAddress: "0x1111111111111111111111111111111111111111",
        },
      },
    ]);
  });

  it("loads a payment intent by id from payment_intents", async () => {
    const query = new FakePaymentIntentQuery();
    const client = {
      from(table: string) {
        assert.equal(table, "payment_intents");
        return query;
      },
    };

    const repositories = createSupabaseAgentPayRepositories(client as unknown as AgentPaySupabaseClient);
    const intent = await repositories.paymentIntents.getPaymentIntent("pay_123");

    assert.equal(intent?.id, "pay_123");
    assert.equal(intent?.status, "AWAITING_APPROVAL");
    assert.equal(intent?.routeCalldata, "0x1234");
    assert.deepEqual(query.calls, [
      ["select", ["*"]],
      ["eq", ["id", "pay_123"]],
      ["maybeSingle", []],
    ]);
  });

  it("marks a payment intent executing with source transaction hash", async () => {
    const query = new FakePaymentIntentQuery();
    const eventQuery = new FakePaymentEventQuery();
    const client = {
      from(table: string) {
        if (table === "payment_events") {
          return eventQuery;
        }

        assert.equal(table, "payment_intents");
        return query;
      },
    };

    const repositories = createSupabaseAgentPayRepositories(client as unknown as AgentPaySupabaseClient);
    await repositories.paymentIntents.markPaymentExecuting(
      "pay_123",
      "0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
      "2026-07-02T14:40:00.000Z",
    );

    assert.deepEqual(query.updated, {
      status: "EXECUTING",
      source_tx_hash: "0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
      approved_at: "2026-07-02T14:40:00.000Z",
    });
    assert.deepEqual(query.calls, [
      [
        "update",
        [
          {
            status: "EXECUTING",
            source_tx_hash: "0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
            approved_at: "2026-07-02T14:40:00.000Z",
          },
        ],
      ],
      ["eq", ["id", "pay_123"]],
    ]);
    assert.deepEqual(eventQuery.inserted, [
      {
        payment_intent_id: "pay_123",
        event_type: "PAYMENT_EXECUTING",
        message: "Payment execution started.",
        metadata: {
          sourceTxHash: "0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
          approvedAt: "2026-07-02T14:40:00.000Z",
        },
      },
    ]);
  });

  it("claims payment approval only while the intent is awaiting approval", async () => {
    const query = new FakePaymentIntentQuery();
    const eventQuery = new FakePaymentEventQuery();
    const client = {
      from(table: string) {
        if (table === "payment_events") {
          return eventQuery;
        }

        assert.equal(table, "payment_intents");
        return query;
      },
    };

    const repositories = createSupabaseAgentPayRepositories(client as unknown as AgentPaySupabaseClient);
    const claimed = await repositories.paymentIntents.claimPaymentApproval(
      "pay_123",
      "2026-07-02T14:40:00.000Z",
    );

    assert.equal(claimed, true);
    assert.deepEqual(query.updated, {
      status: "APPROVED",
      approved_at: "2026-07-02T14:40:00.000Z",
    });
    assert.deepEqual(query.calls, [
      [
        "update",
        [
          {
            status: "APPROVED",
            approved_at: "2026-07-02T14:40:00.000Z",
          },
        ],
      ],
      ["eq", ["id", "pay_123"]],
      ["eq", ["status", "AWAITING_APPROVAL"]],
      ["select", ["id"]],
      ["maybeSingle", []],
    ]);
    assert.deepEqual(eventQuery.inserted, [
      {
        payment_intent_id: "pay_123",
        event_type: "PAYMENT_APPROVED",
        message: "Exact approval phrase accepted.",
        metadata: {
          approvedAt: "2026-07-02T14:40:00.000Z",
        },
      },
    ]);
  });

  it("returns false when payment approval was already claimed", async () => {
    const query = new FakePaymentIntentQuery();
    query.maybeSingleData = null;
    const eventQuery = new FakePaymentEventQuery();
    const client = {
      from(table: string) {
        if (table === "payment_events") {
          return eventQuery;
        }

        assert.equal(table, "payment_intents");
        return query;
      },
    };

    const repositories = createSupabaseAgentPayRepositories(client as unknown as AgentPaySupabaseClient);
    const claimed = await repositories.paymentIntents.claimPaymentApproval(
      "pay_123",
      "2026-07-02T14:40:00.000Z",
    );

    assert.equal(claimed, false);
    assert.deepEqual(eventQuery.inserted, []);
  });

  it("marks a payment intent failed", async () => {
    const query = new FakePaymentIntentQuery();
    const eventQuery = new FakePaymentEventQuery();
    const client = {
      from(table: string) {
        if (table === "payment_events") {
          return eventQuery;
        }

        assert.equal(table, "payment_intents");
        return query;
      },
    };

    const repositories = createSupabaseAgentPayRepositories(client as unknown as AgentPaySupabaseClient);
    await repositories.paymentIntents.markPaymentFailed("pay_123", "EXECUTION_FAILED", "RPC failed");

    assert.deepEqual(query.updated, {
      status: "FAILED",
      error_code: "EXECUTION_FAILED",
      error_message: "RPC failed",
    });
    assert.deepEqual(eventQuery.inserted, [
      {
        payment_intent_id: "pay_123",
        event_type: "PAYMENT_FAILED",
        message: "RPC failed",
        metadata: {
          errorCode: "EXECUTION_FAILED",
        },
      },
    ]);
  });

  it("marks a payment intent expired", async () => {
    const query = new FakePaymentIntentQuery();
    const eventQuery = new FakePaymentEventQuery();
    const client = {
      from(table: string) {
        if (table === "payment_events") {
          return eventQuery;
        }

        assert.equal(table, "payment_intents");
        return query;
      },
    };

    const repositories = createSupabaseAgentPayRepositories(client as unknown as AgentPaySupabaseClient);
    await repositories.paymentIntents.markPaymentExpired("pay_123");

    assert.deepEqual(query.updated, {
      status: "EXPIRED",
      error_code: "DEADLINE_EXPIRED",
      error_message: "Payment approval deadline expired.",
    });
    assert.deepEqual(eventQuery.inserted, [
      {
        payment_intent_id: "pay_123",
        event_type: "PAYMENT_EXPIRED",
        message: "Payment approval deadline expired.",
        metadata: {
          errorCode: "DEADLINE_EXPIRED",
        },
      },
    ]);
  });

  it("marks a payment intent completed with destination transaction hash", async () => {
    const query = new FakePaymentIntentQuery();
    const eventQuery = new FakePaymentEventQuery();
    const client = {
      from(table: string) {
        if (table === "payment_events") {
          return eventQuery;
        }

        assert.equal(table, "payment_intents");
        return query;
      },
    };

    const repositories = createSupabaseAgentPayRepositories(client as unknown as AgentPaySupabaseClient);
    await repositories.paymentIntents.markPaymentCompleted(
      "pay_123",
      "0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
      "2026-07-02T14:43:00.000Z",
    );

    assert.deepEqual(query.updated, {
      status: "COMPLETED",
      destination_tx_hash: "0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
      completed_at: "2026-07-02T14:43:00.000Z",
    });
    assert.deepEqual(eventQuery.inserted, [
      {
        payment_intent_id: "pay_123",
        event_type: "PAYMENT_COMPLETED",
        message: "Payment completed.",
        metadata: {
          destinationTxHash: "0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
          completedAt: "2026-07-02T14:43:00.000Z",
        },
      },
    ]);
  });

  it("lists latest payment intents by creation time", async () => {
    const query = new FakePaymentIntentListQuery();
    query.data = [
      {
        id: "pay_123",
        account_address: "0x3333333333333333333333333333333333333333",
        owner_address: "0x2222222222222222222222222222222222222222",
        status: "EXECUTING",
        payment_type: "WALLET_PAYMENT",
        source_chain_id: 196,
        destination_chain_id: 8453,
        source_token_address: "0x5555555555555555555555555555555555555555",
        source_token_symbol: "USDT0",
        destination_token_address: "0x6666666666666666666666666666666666666666",
        destination_token_symbol: "USDC",
        recipient_address: "0x1111111111111111111111111111111111111111",
        amount_out: "10",
        max_amount_in: "10.18",
        max_native_fee: "0",
        route_provider: "LI.FI",
        route_target: "0x7777777777777777777777777777777777777777",
        route_calldata: "0x1234",
        route_calldata_hash: "0x56570de287d73cd1cb6092bb8fdee6173974955fdef345ae579ee9f475ea7432",
        route_summary: "Swap and bridge.",
        estimated_fee: "0.12",
        estimated_eta_seconds: 120,
        nonce: "42",
        deadline: "2026-07-02T14:45:00.000Z",
        purpose: "design bounty",
        approval_phrase: "APPROVE pay_123",
        approved_at: "2026-07-02T14:40:00.000Z",
        source_tx_hash: "0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
        destination_tx_hash: null,
        lifi_tracking_id: null,
        error_code: null,
        error_message: null,
        created_at: "2026-07-02T14:30:00.000Z",
      },
    ];
    const client = {
      from(table: string) {
        assert.equal(table, "payment_intents");
        return query;
      },
    };

    const repositories = createSupabaseAgentPayRepositories(client as unknown as AgentPaySupabaseClient);
    const intents = await repositories.paymentIntents.listPaymentIntents({ limit: 5 });

    assert.equal(intents.length, 1);
    assert.equal(intents[0].id, "pay_123");
    assert.equal(intents[0].createdAt, "2026-07-02T14:30:00.000Z");
    assert.deepEqual(query.calls, [
      ["select", ["*"]],
      ["order", ["created_at", { ascending: false }]],
      ["limit", [5]],
      ["then", []],
    ]);
  });

  it("lists payment events for an intent by creation time", async () => {
    const query = new FakePaymentEventQuery();
    query.data = [
      {
        id: "event_1",
        payment_intent_id: "pay_123",
        event_type: "PAYMENT_EXECUTING",
        message: "Payment execution started.",
        metadata: {
          sourceTxHash: "0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
        },
        created_at: "2026-07-02T14:40:00.000Z",
      },
      {
        id: "event_0",
        payment_intent_id: "pay_123",
        event_type: "PAYMENT_CREATED",
        message: null,
        metadata: {},
        created_at: "2026-07-02T14:30:00.000Z",
      },
    ];
    const client = {
      from(table: string) {
        assert.equal(table, "payment_events");
        return query;
      },
    };

    const repositories = createSupabaseAgentPayRepositories(client as unknown as AgentPaySupabaseClient);
    const events = await repositories.paymentEvents.listPaymentEvents({ paymentIntentId: "pay_123", limit: 2 });

    assert.deepEqual(events, [
      {
        id: "event_1",
        paymentIntentId: "pay_123",
        eventType: "PAYMENT_EXECUTING",
        message: "Payment execution started.",
        metadata: {
          sourceTxHash: "0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
        },
        createdAt: "2026-07-02T14:40:00.000Z",
      },
      {
        id: "event_0",
        paymentIntentId: "pay_123",
        eventType: "PAYMENT_CREATED",
        message: undefined,
        metadata: {},
        createdAt: "2026-07-02T14:30:00.000Z",
      },
    ]);
    assert.deepEqual(query.calls, [
      ["select", ["*"]],
      ["eq", ["payment_intent_id", "pay_123"]],
      ["order", ["created_at", { ascending: false }]],
      ["limit", [2]],
      ["then", []],
    ]);
  });

  it("throws useful errors from Supabase failures", async () => {
    const client = {
      from() {
        return {
          select() {
            return this;
          },
          eq() {
            return this;
          },
          order() {
            return this;
          },
          limit() {
            return this;
          },
          maybeSingle() {
            return Promise.resolve({ data: null, error: { message: "permission denied" } });
          },
        };
      },
    };

    const repositories = createSupabaseAgentPayRepositories(client as unknown as AgentPaySupabaseClient);

    await assert.rejects(() => repositories.wallets.getActiveWallet(), /Failed to load active AgentPay wallet/);
  });

  it("maps setup intents to setup_intents insert rows", async () => {
    const query = new FakeSetupIntentQuery();
    const client = {
      from(table: string) {
        assert.equal(table, "setup_intents");
        return query;
      },
    };

    const repositories = createSupabaseAgentPayRepositories(client as unknown as AgentPaySupabaseClient);
    await repositories.setupIntents.createSetupIntent({
      id: "setup_123",
      ownerAddress: "0x2222222222222222222222222222222222222222",
      executorAddress: "0x4444444444444444444444444444444444444444",
      messageToSign: "AgentPay wallet setup",
      status: "PENDING",
      expiresAt: "2026-07-03T04:15:00.000Z",
      homeChainId: 1952,
    });

    assert.deepEqual(query.inserted, {
      id: "setup_123",
      owner_address: "0x2222222222222222222222222222222222222222",
      executor_address: "0x4444444444444444444444444444444444444444",
      message_to_sign: "AgentPay wallet setup",
      status: "PENDING",
      expires_at: "2026-07-03T04:15:00.000Z",
      home_chain_id: 1952,
    });
  });

  it("loads setup intent by id from setup_intents", async () => {
    const query = new FakeSetupIntentQuery();
    const client = {
      from(table: string) {
        assert.equal(table, "setup_intents");
        return query;
      },
    };

    const repositories = createSupabaseAgentPayRepositories(client as unknown as AgentPaySupabaseClient);
    const intent = await repositories.setupIntents.getSetupIntent("setup_123");

    assert.equal(intent?.id, "setup_123");
    assert.equal(intent?.status, "COMPLETED");
    assert.equal(intent?.accountAddress, "0x3333333333333333333333333333333333333333");
    assert.deepEqual(query.calls, [
      ["select", ["*"]],
      ["eq", ["id", "setup_123"]],
      ["maybeSingle", []],
    ]);
  });

  it("updates setup intent lifecycle states", async () => {
    const query = new FakeSetupIntentQuery();
    const client = {
      from(table: string) {
        assert.equal(table, "setup_intents");
        return query;
      },
    };

    const repositories = createSupabaseAgentPayRepositories(client as unknown as AgentPaySupabaseClient);
    await repositories.setupIntents.markSetupSigned(
      "setup_123",
      "0x2222222222222222222222222222222222222222",
      "0xaaaaaaaa",
    );

    assert.deepEqual(query.updated, {
      status: "SIGNED",
      owner_address: "0x2222222222222222222222222222222222222222",
      signature: "0xaaaaaaaa",
    });

    await repositories.setupIntents.markSetupCompleted(
      "setup_123",
      "0x3333333333333333333333333333333333333333",
      "2026-07-03T04:02:00.000Z",
    );

    assert.deepEqual(query.updated, {
      status: "COMPLETED",
      account_address: "0x3333333333333333333333333333333333333333",
      completed_at: "2026-07-03T04:02:00.000Z",
    });
  });

  it("creates an agent wallet row", async () => {
    const query = new FakeAgentWalletMutationQuery();
    const client = {
      from(table: string) {
        assert.equal(table, "agent_wallets");
        return query;
      },
    };

    const repositories = createSupabaseAgentPayRepositories(client as unknown as AgentPaySupabaseClient);
    await repositories.wallets.createAgentWallet({
      ownerAddress: "0x2222222222222222222222222222222222222222",
      accountAddress: "0x3333333333333333333333333333333333333333",
      homeChainId: 196,
      executorAddress: "0x4444444444444444444444444444444444444444",
      status: "ACTIVE",
    });

    assert.deepEqual(query.inserted, {
      owner_address: "0x2222222222222222222222222222222222222222",
      account_address: "0x3333333333333333333333333333333333333333",
      home_chain_id: 196,
      executor_address: "0x4444444444444444444444444444444444444444",
      status: "ACTIVE",
    });
  });
});

describe("toPaymentIntentRow", () => {
  it("omits undefined optional values", () => {
    const row = toPaymentIntentRow({
      id: "pay_123",
      accountAddress: "0x3333333333333333333333333333333333333333",
      ownerAddress: "0x2222222222222222222222222222222222222222",
      status: "AWAITING_APPROVAL",
      paymentType: "WALLET_PAYMENT",
      sourceChainId: 196,
      destinationChainId: 8453,
      sourceTokenAddress: "0x5555555555555555555555555555555555555555",
      sourceTokenSymbol: "USDT0",
      destinationTokenAddress: "0x6666666666666666666666666666666666666666",
      destinationTokenSymbol: "USDC",
      recipientAddress: "0x1111111111111111111111111111111111111111",
      amountOut: "10",
      maxAmountIn: "10.18",
      maxNativeFee: "0",
      routeProvider: "LI.FI",
      routeTarget: "0x7777777777777777777777777777777777777777",
      routeCalldata: "0x1234",
      routeCalldataHash: "0x56570de287d73cd1cb6092bb8fdee6173974955fdef345ae579ee9f475ea7432",
      routeSummary: "Swap and bridge.",
      nonce: "42",
      deadline: "2026-07-02T14:45:00.000Z",
      purpose: "design bounty",
      approvalPhrase: "APPROVE pay_123",
    });

    assert.equal("estimated_fee" in row, false);
    assert.equal("estimated_eta_seconds" in row, false);
  });
});
