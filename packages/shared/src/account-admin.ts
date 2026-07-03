import { z } from "zod";

import { evmAddressSchema } from "./payment-intent.ts";

const positiveIntegerStringSchema = z.string().regex(/^[1-9]\d*$/, "Expected a positive integer string");

export const prepareAccountAdminTransactionInputSchema = z.discriminatedUnion("action", [
  z.object({
    action: z.literal("PAUSE"),
  }),
  z.object({
    action: z.literal("UNPAUSE"),
  }),
  z.object({
    action: z.literal("SET_EXECUTOR"),
    newExecutorAddress: evmAddressSchema,
  }),
  z.object({
    action: z.literal("CANCEL_NONCE"),
    nonce: positiveIntegerStringSchema,
  }),
  z.object({
    action: z.literal("SET_ALLOWED_TOKEN"),
    tokenAddress: evmAddressSchema,
    allowed: z.boolean(),
  }),
  z.object({
    action: z.literal("WITHDRAW_NATIVE"),
    toAddress: evmAddressSchema,
    amountAtomic: positiveIntegerStringSchema,
  }),
  z.object({
    action: z.literal("WITHDRAW_TOKEN"),
    tokenAddress: evmAddressSchema,
    toAddress: evmAddressSchema,
    amountAtomic: positiveIntegerStringSchema,
  }),
]);

export type PrepareAccountAdminTransactionInput = z.infer<typeof prepareAccountAdminTransactionInputSchema>;
