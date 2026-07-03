import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { getBalanceInputSchema } from "./balance.ts";

describe("getBalanceInputSchema", () => {
  it("defaults to USDC and USDT balances", () => {
    assert.deepEqual(getBalanceInputSchema.parse({}), {
      tokenSymbols: ["USDC", "USDT"],
    });
  });

  it("accepts an explicit stablecoin subset", () => {
    assert.deepEqual(getBalanceInputSchema.parse({ tokenSymbols: ["USDT"] }), {
      tokenSymbols: ["USDT"],
    });
  });
});
