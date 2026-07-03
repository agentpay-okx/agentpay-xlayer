export const SUPPORTED_CHAINS = {
  56: {
    id: 56,
    name: "BNB Chain",
    nativeCurrency: {
      symbol: "BNB",
      decimals: 18,
    },
  },
  97: {
    id: 97,
    name: "BNB Chain Testnet",
    nativeCurrency: {
      symbol: "tBNB",
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
