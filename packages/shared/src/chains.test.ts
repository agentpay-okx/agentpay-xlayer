import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { getNativeCurrency } from "./chains.ts";

describe("getNativeCurrency", () => {
  it("returns native currency metadata for supported chains", () => {
    assert.deepEqual(getNativeCurrency(56), {
      symbol: "BNB",
      decimals: 18,
    });
    assert.deepEqual(getNativeCurrency(97), {
      symbol: "tBNB",
      decimals: 18,
    });
  });

  it("throws for unsupported chains", () => {
    assert.throws(() => getNativeCurrency(1), /Unsupported chain 1/);
  });
});
