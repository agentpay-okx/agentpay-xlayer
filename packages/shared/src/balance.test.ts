import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { getBalanceInputSchema } from "./balance.ts";

describe("getBalanceInputSchema", () => {
  it("defaults to X Layer USDt0 and USDC balances", () => {
    assert.deepEqual(getBalanceInputSchema.parse({}), {
      tokenSymbols: ["USDT0", "USDC"],
    });
  });

  it("accepts an explicit stablecoin subset", () => {
    assert.deepEqual(getBalanceInputSchema.parse({ tokenSymbols: ["USDT0"] }), {
      tokenSymbols: ["USDT0"],
    });
  });
});
