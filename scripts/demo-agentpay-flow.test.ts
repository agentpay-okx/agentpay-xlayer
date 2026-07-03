import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { runLocalAgentPayDemo } from "./demo-agentpay-flow.ts";

describe("runLocalAgentPayDemo", () => {
  it("runs wallet setup and the chat-approved payment flow with in-memory adapters", async () => {
    const result = await runLocalAgentPayDemo();

    assert.equal(result.initialWallet.status, "NOT_CREATED");
    assert.equal(result.setup.setupIntentId, "setup_demo");
    assert.equal(result.completedSetup.status, "COMPLETED");
    assert.equal(result.checkedSetup.status, "COMPLETED");
    assert.equal(result.checkedSetup.accountAddress, "0x3333333333333333333333333333333333333333");
    assert.equal(result.wallet.status, "ACTIVE");
    assert.equal(result.balance.status, "ACTIVE");
    assert.equal(result.invoice.status, "PARSED");
    assert.equal(result.invoice.invoiceId, "inv_demo");
    assert.equal(result.invoice.paymentInput.paymentType, "INVOICE_PAYMENT");
    assert.equal(result.x402.status, "PARSED");
    assert.equal(result.x402.paymentInput.paymentType, "X402_PAYMENT");
    assert.equal(result.x402.standardX402SignatureRequired, true);
    assert.equal(result.x402.resource.serviceName, "Market API");
    assert.equal(result.quote.paymentType, "SWAP_BRIDGE_PAY");
    assert.equal(result.quote.maxNativeFeeDisplay, "0.0025 BNB");
    assert.equal(result.routeAllowance.status, "ACTIVE");
    assert.equal(result.routeAllowance.routeTargetAllowed, true);
    assert.equal(result.prepared.paymentIntentId, "pay_demo");
    assert.equal(result.prepared.approvalPhrase, "APPROVE pay_demo");
    assert.equal(result.prepared.summary.maxNativeFeeDisplay, "0.0025 BNB");
    assert.equal(result.prepared.summary.purpose, "design bounty");
    assert.equal(result.executed.status, "EXECUTING");
    assert.equal(result.tracked.status, "COMPLETED");
    assert.equal(result.transactions.transactions[0]?.status, "COMPLETED");
    assert.equal(result.transactions.transactions[0]?.paymentIntentId, "pay_demo");
    assert.equal(result.transactions.transactions[0]?.paymentType, "INVOICE_PAYMENT");
    assert.deepEqual(
      result.events.events.map((event) => event.eventType),
      ["PAYMENT_PREPARED", "PAYMENT_APPROVED", "PAYMENT_EXECUTING", "PAYMENT_COMPLETED"],
    );
    assert.match(result.transcript.join("\n"), /Setup intent: setup_demo/);
    assert.match(result.transcript.join("\n"), /Setup completed: 0x3333333333333333333333333333333333333333/);
    assert.match(result.transcript.join("\n"), /Invoice parsed: inv_demo/);
    assert.match(result.transcript.join("\n"), /x402 parsed: Market API/);
    assert.match(result.transcript.join("\n"), /Approval required: APPROVE pay_demo/);
    assert.match(result.transcript.join("\n"), /Route target allowlisted: true/);
  });
});
