import { z } from "zod";

export const SUPPORTED_CHAINS = {
  196: {
    id: 196,
    name: "X Layer",
    nativeCurrency: {
      symbol: "OKB",
      decimals: 18,
    },
  },
  1952: {
    id: 1952,
    name: "X Layer Testnet",
    nativeCurrency: {
      symbol: "OKB",
      decimals: 18,
    },
  },
  8453: {
    id: 8453,
    name: "Base",
    nativeCurrency: {
      symbol: "ETH",
      decimals: 18,
    },
  },
} as const;

export type SupportedChainId = keyof typeof SUPPORTED_CHAINS;
export type NativeCurrency = (typeof SUPPORTED_CHAINS)[SupportedChainId]["nativeCurrency"];

export const X_LAYER_NETWORK_CHAIN_IDS = {
  mainnet: 196,
  testnet: 1952,
} as const;

export const xLayerNetworkSchema = z.enum(["mainnet", "testnet"]);
export const xLayerHomeChainIdSchema = z.union([z.literal(196), z.literal(1952)]);
export const networkSelectionShape = {
  network: xLayerNetworkSchema.optional(),
  homeChainId: xLayerHomeChainIdSchema.optional(),
} as const;

export type XLayerNetwork = z.infer<typeof xLayerNetworkSchema>;
export type XLayerHomeChainId = z.infer<typeof xLayerHomeChainIdSchema>;
export type NetworkSelectionInput = {
  network?: XLayerNetwork;
  homeChainId?: XLayerHomeChainId;
};

export function resolveXLayerHomeChainId(input: NetworkSelectionInput, fallbackHomeChainId: XLayerHomeChainId = 196): XLayerHomeChainId {
  const networkHomeChainId = input.network ? X_LAYER_NETWORK_CHAIN_IDS[input.network] : undefined;

  if (networkHomeChainId !== undefined && input.homeChainId !== undefined && networkHomeChainId !== input.homeChainId) {
    throw new Error(`Network ${input.network} maps to chain ${networkHomeChainId}, but homeChainId ${input.homeChainId} was provided.`);
  }

  return input.homeChainId ?? networkHomeChainId ?? fallbackHomeChainId;
}

export function getChainName(chainId: number): string {
  return SUPPORTED_CHAINS[chainId as SupportedChainId]?.name ?? `Chain ${chainId}`;
}

export function getNativeCurrency(chainId: number): NativeCurrency {
  const nativeCurrency = SUPPORTED_CHAINS[chainId as SupportedChainId]?.nativeCurrency;

  if (!nativeCurrency) {
    throw new Error(`Unsupported chain ${chainId}.`);
  }

  return nativeCurrency;
}

export function formatNativeAmount(atomicAmount: string, chainId: number): string {
  const nativeCurrency = getNativeCurrency(chainId);
  return `${atomicToDecimal(BigInt(atomicAmount), nativeCurrency.decimals)} ${nativeCurrency.symbol}`;
}

function atomicToDecimal(amount: bigint, decimals: number): string {
  const padded = amount.toString().padStart(decimals + 1, "0");
  const whole = padded.slice(0, -decimals);
  const fractional = padded.slice(-decimals).replace(/0+$/, "");
  return fractional ? `${whole}.${fractional}` : whole;
}
