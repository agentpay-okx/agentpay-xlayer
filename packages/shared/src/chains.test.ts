import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { getNativeCurrency, resolveXLayerHomeChainId } from "./chains.ts";

describe("getNativeCurrency", () => {
  it("returns native currency metadata for supported chains", () => {
    assert.deepEqual(getNativeCurrency(196), {
      symbol: "OKB",
      decimals: 18,
    });
    assert.deepEqual(getNativeCurrency(1952), {
      symbol: "OKB",
      decimals: 18,
    });
  });

  it("throws for unsupported chains", () => {
    assert.throws(() => getNativeCurrency(1), /Unsupported chain 1/);
  });

  it("resolves X Layer network selectors", () => {
    assert.equal(resolveXLayerHomeChainId({ network: "mainnet" }), 196);
    assert.equal(resolveXLayerHomeChainId({ network: "testnet" }), 1952);
    assert.equal(resolveXLayerHomeChainId({ homeChainId: 1952 }), 1952);
    assert.throws(() => resolveXLayerHomeChainId({ network: "mainnet", homeChainId: 1952 }), /maps to chain 196/);
  });
});
