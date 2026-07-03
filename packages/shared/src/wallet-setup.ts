import { z } from "zod";

import { evmAddressSchema } from "./payment-intent.ts";

export const setupIntentStatusSchema = z.enum(["PENDING", "SIGNED", "DEPLOYING", "COMPLETED", "EXPIRED", "FAILED"]);

export type SetupIntentStatus = z.infer<typeof setupIntentStatusSchema>;

export const prepareWalletCreationInputSchema = z.object({
  ownerAddress: evmAddressSchema.optional(),
});

export type PrepareWalletCreationInput = z.input<typeof prepareWalletCreationInputSchema>;

export const checkWalletCreationInputSchema = z.object({
  setupIntentId: z.string().trim().min(1),
});

export type CheckWalletCreationInput = z.infer<typeof checkWalletCreationInputSchema>;

export const getAgentWalletInputSchema = z.object({});

export type GetAgentWalletInput = z.infer<typeof getAgentWalletInputSchema>;

export const prepareRouteTargetAllowanceInputSchema = z.object({
  routeTarget: evmAddressSchema,
  allowed: z.boolean().default(true),
});

export type PrepareRouteTargetAllowanceInput = z.input<typeof prepareRouteTargetAllowanceInputSchema>;

export const checkRouteTargetAllowanceInputSchema = z.object({
  routeTarget: evmAddressSchema,
});

export type CheckRouteTargetAllowanceInput = z.infer<typeof checkRouteTargetAllowanceInputSchema>;

export const setupSignatureSchema = z.string().regex(/^0x[a-fA-F0-9]{130}$/, "Expected an EVM signature");

export const completeWalletSetupInputSchema = z.object({
  setupIntentId: z.string().trim().min(1),
  signature: setupSignatureSchema,
});

export type CompleteWalletSetupInput = z.infer<typeof completeWalletSetupInputSchema>;

export interface SetupIntentRecord {
  id: string;
  ownerAddress?: string;
  executorAddress: string;
  messageToSign: string;
  signature?: string;
  status: SetupIntentStatus;
  expiresAt: string;
  accountAddress?: string;
  errorCode?: string;
  errorMessage?: string;
  completedAt?: string;
}
