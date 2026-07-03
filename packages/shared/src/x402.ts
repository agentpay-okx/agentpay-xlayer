import { z } from "zod";

import { getChainName } from "./chains.ts";
import { evmAddressSchema, preparePaymentInputSchema } from "./payment-intent.ts";
import { getStableTokenMetadata, STABLE_TOKEN_SYMBOLS, stableTokenSymbolSchema } from "./tokens.ts";
import type { StableTokenSymbol } from "./tokens.ts";

const positiveIntegerStringSchema = z.string().regex(/^[1-9]\d*$/, "Expected a positive integer string");

export const parseX402PaymentRequiredInputSchema = z.object({
  paymentRequired: z.union([z.string().trim().min(1), z.record(z.string(), z.unknown())]),
  sourceTokenSymbol: stableTokenSymbolSchema.default("USDT"),
});

export type ParseX402PaymentRequiredInput = z.input<typeof parseX402PaymentRequiredInputSchema>;

const x402ResourceInfoSchema = z
  .object({
    url: z.string().url(),
    description: z.string().optional(),
    mimeType: z.string().optional(),
    serviceName: z.string().optional(),
  })
  .passthrough();

const x402PaymentRequirementSchema = z
  .object({
    scheme: z.string(),
    network: z.string(),
    amount: positiveIntegerStringSchema,
    asset: z.string(),
    payTo: evmAddressSchema,
    maxTimeoutSeconds: z.number().int().positive(),
    extra: z.record(z.string(), z.unknown()).optional(),
  })
  .passthrough();

const x402PaymentRequiredSchema = z
  .object({
    x402Version: z.literal(2),
    error: z.string().optional(),
    resource: x402ResourceInfoSchema,
    accepts: z.array(x402PaymentRequirementSchema).min(1),
    extensions: z.record(z.string(), z.unknown()).optional(),
  })
  .passthrough();

export interface ParsedX402PaymentRequired {
  x402Version: 2;
  resource: {
    url: string;
    description?: string;
    serviceName?: string;
    mimeType?: string;
  };
  selectedRequirement: {
    scheme: "exact";
    network: string;
    chainId: number;
    chain: string;
    asset: string;
    tokenSymbol: StableTokenSymbol;
    payTo: string;
    amountAtomic: string;
    amount: string;
    maxTimeoutSeconds: number;
  };
  paymentInput: {
    recipientAddress: string;
    destinationChainId: number;
    destinationChain: string;
    destinationTokenSymbol: StableTokenSymbol;
    amountOut: string;
    purpose: string;
    sourceTokenSymbol: StableTokenSymbol;
    paymentType: "X402_PAYMENT";
  };
  standardX402SignatureRequired: true;
}

export function parseX402PaymentRequired(rawInput: ParseX402PaymentRequiredInput): ParsedX402PaymentRequired {
  const input = parseX402PaymentRequiredInputSchema.parse(rawInput);
  const paymentRequired = x402PaymentRequiredSchema.parse(decodePaymentRequired(input.paymentRequired));
  const selected = paymentRequired.accepts.map(toSupportedRequirement).find((requirement) => requirement !== null);

  if (!selected) {
    throw new Error("No AgentPay-supported x402 payment requirement was found.");
  }

  const purpose = createX402Purpose(paymentRequired.resource);
  const paymentInput = preparePaymentInputSchema.parse({
    recipientAddress: selected.payTo,
    destinationChainId: selected.chainId,
    destinationTokenSymbol: selected.tokenSymbol,
    amountOut: selected.amount,
    purpose,
    sourceTokenSymbol: input.sourceTokenSymbol,
    paymentType: "X402_PAYMENT",
  });

  return {
    x402Version: 2,
    resource: {
      url: paymentRequired.resource.url,
      description: paymentRequired.resource.description,
      serviceName: paymentRequired.resource.serviceName,
      mimeType: paymentRequired.resource.mimeType,
    },
    selectedRequirement: selected,
    paymentInput: {
      recipientAddress: paymentInput.recipientAddress,
      destinationChainId: paymentInput.destinationChainId,
      destinationChain: getChainName(paymentInput.destinationChainId),
      destinationTokenSymbol: paymentInput.destinationTokenSymbol,
      amountOut: paymentInput.amountOut,
      purpose: paymentInput.purpose,
      sourceTokenSymbol: paymentInput.sourceTokenSymbol,
      paymentType: "X402_PAYMENT",
    },
    standardX402SignatureRequired: true,
  };
}

function decodePaymentRequired(paymentRequired: string | Record<string, unknown>): unknown {
  if (typeof paymentRequired !== "string") {
    return paymentRequired;
  }

  const trimmed = paymentRequired.trim();
  const json = trimmed.startsWith("{") ? trimmed : Buffer.from(trimmed, "base64").toString("utf8");

  return JSON.parse(json) as unknown;
}

function toSupportedRequirement(requirement: z.infer<typeof x402PaymentRequirementSchema>):
  | ParsedX402PaymentRequired["selectedRequirement"]
  | null {
  if (requirement.scheme !== "exact") {
    return null;
  }

  const chainId = parseEip155Network(requirement.network);

  if (!chainId) {
    return null;
  }

  const tokenSymbol = findStableTokenSymbolByAddress(chainId, requirement.asset);

  if (!tokenSymbol) {
    return null;
  }

  const token = getStableTokenMetadata(chainId, tokenSymbol);

  return {
    scheme: "exact",
    network: requirement.network,
    chainId,
    chain: getChainName(chainId),
    asset: requirement.asset,
    tokenSymbol,
    payTo: requirement.payTo,
    amountAtomic: requirement.amount,
    amount: atomicToDecimal(BigInt(requirement.amount), token.decimals),
    maxTimeoutSeconds: requirement.maxTimeoutSeconds,
  };
}

function parseEip155Network(network: string): number | null {
  const match = network.match(/^eip155:(\d+)$/);

  return match ? Number(match[1]) : null;
}

function findStableTokenSymbolByAddress(chainId: number, asset: string): StableTokenSymbol | null {
  const normalizedAsset = asset.toLowerCase();

  for (const symbol of STABLE_TOKEN_SYMBOLS) {
    try {
      if (getStableTokenMetadata(chainId, symbol).address.toLowerCase() === normalizedAsset) {
        return symbol;
      }
    } catch {
      continue;
    }
  }

  return null;
}

function atomicToDecimal(amount: bigint, decimals: number): string {
  const padded = amount.toString().padStart(decimals + 1, "0");
  const whole = padded.slice(0, -decimals);
  const fractional = padded.slice(-decimals).replace(/0+$/, "");

  return fractional ? `${whole}.${fractional}` : whole;
}

function createX402Purpose(resource: z.infer<typeof x402ResourceInfoSchema>): string {
  const details = [resource.serviceName, resource.description].filter(Boolean).join(": ") || resource.url;

  return `x402 payment for ${details}`.slice(0, 280);
}
