import { z } from "zod";

export const STABLE_TOKEN_SYMBOLS = ["USDC", "USDT"] as const;

export const stableTokenSymbolSchema = z.enum(STABLE_TOKEN_SYMBOLS);

export type StableTokenSymbol = z.infer<typeof stableTokenSymbolSchema>;

export const STABLE_TOKEN_DECIMALS: Record<StableTokenSymbol, number> = {
  USDC: 6,
  USDT: 6,
};

export interface StableTokenMetadata {
  symbol: StableTokenSymbol;
  address: string;
  decimals: number;
}

export type StableTokenMetadataOverrides = Partial<
  Record<number, Partial<Record<StableTokenSymbol, Partial<Pick<StableTokenMetadata, "address" | "decimals">>>>>
>;

let configuredStableTokenMetadataOverrides: StableTokenMetadataOverrides = {};

export const STABLE_TOKENS_BY_CHAIN: Record<number, Record<StableTokenSymbol, StableTokenMetadata>> = {
  56: {
    USDC: {
      symbol: "USDC",
      address: "0x8AC76a51cc950d9822D68b83fE1Ad97B32Cd580d",
      decimals: 18,
    },
    USDT: {
      symbol: "USDT",
      address: "0x55d398326f99059fF775485246999027B3197955",
      decimals: 18,
    },
  },
  97: {
    USDC: {
      symbol: "USDC",
      address: "0xEC1C60D64a06896Df296438c12edD14E974FDE47",
      decimals: 6,
    },
    USDT: {
      symbol: "USDT",
      address: "0x337610d27c682E347C9cD60BD4b3b107C9d34dDd",
      decimals: 18,
    },
  },
  8453: {
    USDC: {
      symbol: "USDC",
      address: "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913",
      decimals: 6,
    },
    USDT: {
      symbol: "USDT",
      address: "0xfde4C96c8593536E31F229EA8f37b2ADa2699bb2",
      decimals: 6,
    },
  },
};

export function configureStableTokenMetadataOverrides(overrides: StableTokenMetadataOverrides): void {
  configuredStableTokenMetadataOverrides = { ...overrides };
}

export function getStableTokenDecimals(symbol: string): number {
  const decimals = STABLE_TOKEN_DECIMALS[symbol as StableTokenSymbol];
  if (decimals === undefined) {
    throw new Error(`Unsupported stable token symbol: ${symbol}`);
  }
  return decimals;
}

export function getStableTokenMetadata(chainId: number, symbol: string): StableTokenMetadata {
  const parsedSymbol = stableTokenSymbolSchema.parse(symbol);
  const metadata = STABLE_TOKENS_BY_CHAIN[chainId]?.[parsedSymbol];

  if (!metadata) {
    throw new Error(`Unsupported stable token ${parsedSymbol} on chain ${chainId}.`);
  }

  const override = configuredStableTokenMetadataOverrides[chainId]?.[parsedSymbol];

  return {
    ...metadata,
    ...override,
    symbol: parsedSymbol,
  };
}

export function getStableTokenAddress(chainId: number, symbol: string): string {
  return getStableTokenMetadata(chainId, symbol).address;
}

export function getStableTokenDecimalsForChain(chainId: number, symbol: string): number {
  return getStableTokenMetadata(chainId, symbol).decimals;
}
