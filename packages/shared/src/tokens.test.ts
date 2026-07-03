import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  configureStableTokenMetadataOverrides,
  getStableTokenAddress,
  getStableTokenDecimalsForChain,
  getStableTokenMetadata,
} from "./tokens.ts";

describe("stable token metadata", () => {
  it("returns chain-specific BNB Chain stablecoin metadata", () => {
    assert.equal(getStableTokenAddress(56, "USDT"), "0x55d398326f99059fF775485246999027B3197955");
    assert.equal(getStableTokenDecimalsForChain(56, "USDT"), 18);
    assert.deepEqual(getStableTokenMetadata(56, "USDC"), {
      symbol: "USDC",
      address: "0x8AC76a51cc950d9822D68b83fE1Ad97B32Cd580d",
      decimals: 18,
    });
  });

  it("keeps Base stablecoin decimals distinct from BNB Chain", () => {
    assert.equal(getStableTokenDecimalsForChain(8453, "USDC"), 6);
    assert.equal(getStableTokenAddress(8453, "USDC"), "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913");
  });

  it("returns BNB Chain testnet stablecoin metadata", () => {
    assert.deepEqual(getStableTokenMetadata(97, "USDC"), {
      symbol: "USDC",
      address: "0xEC1C60D64a06896Df296438c12edD14E974FDE47",
      decimals: 6,
    });
    assert.deepEqual(getStableTokenMetadata(97, "USDT"), {
      symbol: "USDT",
      address: "0x337610d27c682E347C9cD60BD4b3b107C9d34dDd",
      decimals: 18,
    });
  });

  it("can override BNB Chain testnet token addresses for mock-token demos", () => {
    configureStableTokenMetadataOverrides({
      97: {
        USDC: {
          address: "0x1111111111111111111111111111111111111111",
        },
        USDT: {
          address: "0x2222222222222222222222222222222222222222",
        },
      },
    });

    try {
      assert.deepEqual(getStableTokenMetadata(97, "USDC"), {
        symbol: "USDC",
        address: "0x1111111111111111111111111111111111111111",
        decimals: 6,
      });
      assert.deepEqual(getStableTokenMetadata(97, "USDT"), {
        symbol: "USDT",
        address: "0x2222222222222222222222222222222222222222",
        decimals: 18,
      });
    } finally {
      configureStableTokenMetadataOverrides({});
    }
  });

  it("throws for unsupported token metadata", () => {
    assert.throws(() => getStableTokenMetadata(1, "USDT"), /Unsupported stable token USDT on chain 1/);
  });
});
