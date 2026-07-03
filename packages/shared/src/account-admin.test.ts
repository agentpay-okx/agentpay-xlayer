import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { prepareAccountAdminTransactionInputSchema } from "./account-admin.ts";

describe("prepareAccountAdminTransactionInputSchema", () => {
  it("accepts pause actions", () => {
    assert.deepEqual(prepareAccountAdminTransactionInputSchema.parse({ action: "PAUSE" }), {
      action: "PAUSE",
    });
  });

  it("accepts executor rotation actions", () => {
    assert.deepEqual(
      prepareAccountAdminTransactionInputSchema.parse({
        action: "SET_EXECUTOR",
        newExecutorAddress: "0x4444444444444444444444444444444444444444",
      }),
      {
        action: "SET_EXECUTOR",
        newExecutorAddress: "0x4444444444444444444444444444444444444444",
      },
    );
  });

  it("rejects invalid withdrawal amounts", () => {
    assert.throws(() =>
      prepareAccountAdminTransactionInputSchema.parse({
        action: "WITHDRAW_NATIVE",
        toAddress: "0x2222222222222222222222222222222222222222",
        amountAtomic: "0",
      }),
    );
  });
});
