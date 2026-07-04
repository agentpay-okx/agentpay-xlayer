import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { Wallet } from "ethers";

import type { SetupIntentRecord } from "@agentpay-ai/shared";

import {
  completeWalletSetup,
  createCompleteWalletSetupHttpHandler,
  createEthersSetupSignatureVerifier,
} from "./complete-wallet-setup.ts";

const owner = new Wallet("0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa");
const otherOwner = new Wallet("0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb");
const executorAddress = "0x4444444444444444444444444444444444444444";
const accountAddress = "0x3333333333333333333333333333333333333333";
const setupIntent: SetupIntentRecord = {
  id: "setup_123",
  executorAddress,
  messageToSign: "AgentPay wallet setup\nSetup intent: setup_123",
  status: "PENDING",
  expiresAt: "2026-07-03T04:15:00.000Z",
};

describe("completeWalletSetup", () => {
  it("verifies signature, deploys account, stores wallet, and completes setup intent", async () => {
    const events: Array<[string, unknown]> = [];
    const signature = await owner.signMessage(setupIntent.messageToSign);

    const output = await completeWalletSetup(
      {
        setupIntentId: "setup_123",
        signature,
      },
      {
        setupIntents: {
          async getSetupIntent(setupIntentId) {
            assert.equal(setupIntentId, "setup_123");
            return setupIntent;
          },
          async markSetupSigned(setupIntentId, ownerAddress, signedMessage) {
            events.push(["signed", { setupIntentId, ownerAddress, signedMessage }]);
          },
          async markSetupCompleted(setupIntentId, completedAccountAddress, completedAt) {
            events.push(["completed", { setupIntentId, completedAccountAddress, completedAt }]);
          },
          async markSetupExpired(setupIntentId) {
            events.push(["expired", setupIntentId]);
          },
          async markSetupFailed(setupIntentId, errorCode, errorMessage) {
            events.push(["failed", { setupIntentId, errorCode, errorMessage }]);
          },
        },
        wallets: {
          async createAgentWallet(wallet) {
            events.push(["wallet", wallet]);
          },
        },
        deployer: {
          async deployAgentPayAccount(request) {
            events.push(["deploy", request]);
            return {
              accountAddress,
              deploymentTxHash: "0xcccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc",
            };
          },
        },
        signatureVerifier: createEthersSetupSignatureVerifier(),
        clock: () => new Date("2026-07-03T04:02:00.000Z"),
      },
    );

    assert.deepEqual(output, {
      setupIntentId: "setup_123",
      status: "COMPLETED",
      ownerAddress: owner.address,
      accountAddress,
      deploymentTxHash: "0xcccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc",
      completedAt: "2026-07-03T04:02:00.000Z",
    });
    assert.deepEqual(events, [
      [
        "signed",
        {
          setupIntentId: "setup_123",
          ownerAddress: owner.address,
          signedMessage: signature,
        },
      ],
      [
        "deploy",
        {
          ownerAddress: owner.address,
          executorAddress,
          homeChainId: 196,
          initialAllowedTokenAddresses: [
            "0x779Ded0c9e1022225f8E0630b35a9b54bE713736",
            "0x74b7F16337b8972027F6196A17a631aC6dE26d22",
          ],
          initialAllowedRouteTargets: [],
        },
      ],
      [
        "wallet",
        {
          ownerAddress: owner.address,
          accountAddress,
          homeChainId: 196,
          executorAddress,
          status: "ACTIVE",
        },
      ],
      [
        "completed",
        {
          setupIntentId: "setup_123",
          completedAccountAddress: accountAddress,
          completedAt: "2026-07-03T04:02:00.000Z",
        },
      ],
    ]);
  });

  it("rejects signatures that do not match a preset owner address", async () => {
    const failed: Array<[string, string, string]> = [];
    const signature = await otherOwner.signMessage(setupIntent.messageToSign);

    await assert.rejects(
      () =>
        completeWalletSetup(
          {
            setupIntentId: "setup_123",
            signature,
          },
          {
            setupIntents: {
              async getSetupIntent() {
                return {
                  ...setupIntent,
                  ownerAddress: owner.address,
                };
              },
              async markSetupSigned() {},
              async markSetupCompleted() {},
              async markSetupExpired() {},
              async markSetupFailed(setupIntentId, errorCode, errorMessage) {
                failed.push([setupIntentId, errorCode, errorMessage]);
              },
            },
            wallets: {
              async createAgentWallet() {},
            },
            deployer: {
              async deployAgentPayAccount() {
                throw new Error("deploy should not be called");
              },
            },
            signatureVerifier: createEthersSetupSignatureVerifier(),
            clock: () => new Date("2026-07-03T04:02:00.000Z"),
          },
        ),
      /Setup signature does not match the expected owner address/,
    );

    assert.equal(failed[0]?.[1], "OWNER_MISMATCH");
  });

  it("uses the setup intent home chain when storing the deployed wallet", async () => {
    const wallets: unknown[] = [];
    const deploys: unknown[] = [];

    await completeWalletSetup(
      {
        setupIntentId: "setup_testnet",
        signature: "0x" + "c".repeat(130),
      },
      {
        setupIntents: {
          async getSetupIntent() {
            return {
              ...setupIntent,
              id: "setup_testnet",
              homeChainId: 1952,
            };
          },
          async markSetupSigned() {},
          async markSetupCompleted() {},
          async markSetupExpired() {},
          async markSetupFailed() {},
        },
        wallets: {
          async createAgentWallet(wallet) {
            wallets.push(wallet);
          },
        },
        deployer: {
          async deployAgentPayAccount(request) {
            deploys.push(request);
            return { accountAddress };
          },
        },
        signatureVerifier: {
          async recoverSignerAddress() {
            return owner.address;
          },
        },
        clock: () => new Date("2026-07-03T04:02:00.000Z"),
        homeChainId: 196,
        initialAllowedTokenAddresses: [
          "0xaf3a391f2b2fb1e139b197c3286f9ebb626605ea",
          "0xc6a555771769b5d82421de5d6bed88431c115462",
        ],
      },
    );

    assert.equal((wallets[0] as { homeChainId: number }).homeChainId, 1952);
    assert.equal((deploys[0] as { homeChainId: number }).homeChainId, 1952);
    assert.deepEqual((deploys[0] as { initialAllowedTokenAddresses: string[] }).initialAllowedTokenAddresses, [
      "0xaf3a391f2b2fb1e139b197c3286f9ebb626605ea",
      "0xc6a555771769b5d82421de5d6bed88431c115462",
    ]);
  });

  it("marks expired setup intents expired before verification or deployment", async () => {
    const signature = await owner.signMessage(setupIntent.messageToSign);
    const events: string[] = [];

    await assert.rejects(
      () =>
        completeWalletSetup(
          {
            setupIntentId: "setup_123",
            signature,
          },
          {
            setupIntents: {
              async getSetupIntent() {
                return setupIntent;
              },
              async markSetupSigned() {
                events.push("signed");
              },
              async markSetupCompleted() {
                events.push("completed");
              },
              async markSetupExpired() {
                events.push("expired");
              },
              async markSetupFailed() {
                events.push("failed");
              },
            },
            wallets: {
              async createAgentWallet() {
                events.push("wallet");
              },
            },
            deployer: {
              async deployAgentPayAccount() {
                events.push("deploy");
                return { accountAddress };
              },
            },
            signatureVerifier: createEthersSetupSignatureVerifier(),
            clock: () => new Date("2026-07-03T04:16:00.000Z"),
          },
        ),
      /Setup intent setup_123 expired/,
    );

    assert.deepEqual(events, ["expired"]);
  });
});

describe("createCompleteWalletSetupHttpHandler", () => {
  it("returns JSON response for setup completion", async () => {
    const signature = await owner.signMessage(setupIntent.messageToSign);
    const handler = createCompleteWalletSetupHttpHandler({
      setupIntents: {
        async getSetupIntent() {
          return setupIntent;
        },
        async markSetupSigned() {},
        async markSetupCompleted() {},
        async markSetupExpired() {},
        async markSetupFailed() {},
      },
      wallets: {
        async createAgentWallet() {},
      },
      deployer: {
        async deployAgentPayAccount() {
          return { accountAddress };
        },
      },
      signatureVerifier: createEthersSetupSignatureVerifier(),
      clock: () => new Date("2026-07-03T04:02:00.000Z"),
    });

    const response = await handler(
      new Request("https://setup.agentpay.dev/api/complete", {
        method: "POST",
        body: JSON.stringify({ setupIntentId: "setup_123", signature }),
      }),
    );
    const body = await response.json();

    assert.equal(response.status, 200);
    assert.equal(body.status, "COMPLETED");
    assert.equal(body.accountAddress, accountAddress);
  });
});
