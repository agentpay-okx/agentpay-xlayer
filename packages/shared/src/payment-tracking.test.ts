import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { listPaymentEventsInputSchema, listTransactionsInputSchema, trackPaymentInputSchema } from "./payment-tracking.ts";

describe("trackPaymentInputSchema", () => {
  it("trims payment intent ids", () => {
    assert.deepEqual(trackPaymentInputSchema.parse({ paymentIntentId: " pay_123 " }), {
      paymentIntentId: "pay_123",
    });
  });
});

describe("listTransactionsInputSchema", () => {
  it("defaults to ten transactions", () => {
    assert.deepEqual(listTransactionsInputSchema.parse({}), {
      limit: 10,
    });
  });

  it("rejects excessive limits", () => {
    assert.throws(() => listTransactionsInputSchema.parse({ limit: 100 }), /Too big/);
  });
});

describe("listPaymentEventsInputSchema", () => {
  it("trims payment intent ids and defaults to twenty events", () => {
    assert.deepEqual(listPaymentEventsInputSchema.parse({ paymentIntentId: " pay_123 " }), {
      paymentIntentId: "pay_123",
      limit: 20,
    });
  });

  it("rejects excessive event limits", () => {
    assert.throws(() => listPaymentEventsInputSchema.parse({ paymentIntentId: "pay_123", limit: 100 }), /Too big/);
  });
});
