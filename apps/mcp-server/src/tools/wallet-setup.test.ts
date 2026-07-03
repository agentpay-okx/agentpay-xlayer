import assert from "node:assert/strict";
import { describe, it } from "node:test";

import type { SetupIntentRecord } from "@agentpay/shared";

import { checkWalletCreation, getAgentWallet, prepareWalletCreation } from "./wallet-setup.ts";

describe("prepareWalletCreation", () => {
  it("creates a pending setup intent and returns a signing URL", async () => {
    const created: SetupIntentRecord[] = [];

    const output = await prepareWalletCreation(
      {},
      {
        setupIntents: {
          async createSetupIntent(intent) {
            created.push(intent);
          },
          async getSetupIntent() {
            return null;
          },
        },
        executorAddress: "0x4444444444444444444444444444444444444444",
        setupWebUrl: "https://setup.agentpay.dev/setup",
        clock: () => new Date("2026-07-03T04:00:00.000Z"),
        createSetupIntentId: () => "setup_123",
        setupTtlSeconds: 900,
      },
    );

    assert.equal(created.length, 1);
    assert.equal(created[0].id, "setup_123");
    assert.equal(created[0].status, "PENDING");
    assert.equal(created[0].executorAddress, "0x4444444444444444444444444444444444444444");
    assert.equal(created[0].expiresAt, "2026-07-03T04:15:00.000Z");
    assert.equal(
      created[0].messageToSign,
      [
        "Create AgentPay wallet",
        "Setup ID: setup_123",
        "Owner: connected signing wallet",
        "Executor: 0x4444444444444444444444444444444444444444",
        "Chain: BNB Chain",
        "Expires: 2026-07-03T04:15:00.000Z",
        "This signature proves wallet ownership only. It does not approve a payment or token transfer.",
      ].join("\n"),
    );
    assert.deepEqual(output, {
      setupIntentId: "setup_123",
      status: "PENDING",
      setupUrl: "https://setup.agentpay.dev/setup?setup_intent_id=setup_123",
      messageToSign: created[0].messageToSign,
      expiresAt: "2026-07-03T04:15:00.000Z",
    });
  });

  it("includes a preset owner address in the setup signing message", async () => {
    const created: SetupIntentRecord[] = [];

    await prepareWalletCreation(
      { ownerAddress: "0x2222222222222222222222222222222222222222" },
      {
        setupIntents: {
          async createSetupIntent(intent) {
            created.push(intent);
          },
          async getSetupIntent() {
            return null;
          },
        },
        executorAddress: "0x4444444444444444444444444444444444444444",
        setupWebUrl: "https://setup.agentpay.dev/setup",
        clock: () => new Date("2026-07-03T04:00:00.000Z"),
        createSetupIntentId: () => "setup_owner",
        setupTtlSeconds: 900,
      },
    );

    assert.equal(created[0].ownerAddress, "0x2222222222222222222222222222222222222222");
    assert.match(created[0].messageToSign, /Owner: 0x2222222222222222222222222222222222222222/);
    assert.match(created[0].messageToSign, /Chain: BNB Chain/);
  });

  it("uses the configured BNB Chain testnet in the setup signing message", async () => {
    const created: SetupIntentRecord[] = [];

    await prepareWalletCreation(
      {},
      {
        setupIntents: {
          async createSetupIntent(intent) {
            created.push(intent);
          },
          async getSetupIntent() {
            return null;
          },
        },
        executorAddress: "0x4444444444444444444444444444444444444444",
        setupWebUrl: "https://setup.agentpay.dev/setup",
        clock: () => new Date("2026-07-03T04:00:00.000Z"),
        createSetupIntentId: () => "setup_testnet",
        setupTtlSeconds: 900,
        homeChainId: 97,
      },
    );

    assert.match(created[0].messageToSign, /Chain: BNB Chain Testnet/);
  });
});

describe("checkWalletCreation", () => {
  it("returns completed setup intent details", async () => {
    const output = await checkWalletCreation(
      { setupIntentId: "setup_123" },
      {
        setupIntents: {
          async getSetupIntent() {
            return {
              id: "setup_123",
              ownerAddress: "0x2222222222222222222222222222222222222222",
              executorAddress: "0x4444444444444444444444444444444444444444",
              messageToSign: "AgentPay wallet setup",
              status: "COMPLETED",
              expiresAt: "2026-07-03T04:15:00.000Z",
              accountAddress: "0x3333333333333333333333333333333333333333",
              completedAt: "2026-07-03T04:02:00.000Z",
            };
          },
        },
        clock: () => new Date("2026-07-03T04:03:00.000Z"),
      },
    );

    assert.deepEqual(output, {
      setupIntentId: "setup_123",
      status: "COMPLETED",
      ownerAddress: "0x2222222222222222222222222222222222222222",
      accountAddress: "0x3333333333333333333333333333333333333333",
      completedAt: "2026-07-03T04:02:00.000Z",
      expiresAt: "2026-07-03T04:15:00.000Z",
    });
  });

  it("reports expired when a pending intent is past its signing deadline", async () => {
    const output = await checkWalletCreation(
      { setupIntentId: "setup_123" },
      {
        setupIntents: {
          async getSetupIntent() {
            return {
              id: "setup_123",
              executorAddress: "0x4444444444444444444444444444444444444444",
              messageToSign: "AgentPay wallet setup",
              status: "PENDING",
              expiresAt: "2026-07-03T04:15:00.000Z",
            };
          },
        },
        clock: () => new Date("2026-07-03T04:16:00.000Z"),
      },
    );

    assert.equal(output.status, "EXPIRED");
  });
});

describe("getAgentWallet", () => {
  it("returns active wallet details when one exists", async () => {
    const output = await getAgentWallet(
      {},
      {
        wallets: {
          async getActiveWallet() {
            return {
              ownerAddress: "0x2222222222222222222222222222222222222222",
              accountAddress: "0x3333333333333333333333333333333333333333",
              homeChainId: 56,
              executorAddress: "0x4444444444444444444444444444444444444444",
              status: "ACTIVE",
            };
          },
        },
      },
    );

    assert.deepEqual(output, {
      status: "ACTIVE",
      wallet: {
        ownerAddress: "0x2222222222222222222222222222222222222222",
        accountAddress: "0x3333333333333333333333333333333333333333",
        homeChainId: 56,
        homeChain: "BNB Chain",
        executorAddress: "0x4444444444444444444444444444444444444444",
      },
    });
  });

  it("returns NOT_CREATED when no wallet exists", async () => {
    const output = await getAgentWallet(
      {},
      {
        wallets: {
          async getActiveWallet() {
            return null;
          },
        },
      },
    );

    assert.deepEqual(output, {
      status: "NOT_CREATED",
      wallet: null,
    });
  });
});
