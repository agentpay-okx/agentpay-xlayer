import { z } from "zod";

import { networkSelectionShape } from "./chains.ts";
import { evmAddressSchema } from "./payment-intent.ts";

const positiveIntegerStringSchema = z.string().regex(/^[1-9]\d*$/, "Expected a positive integer string");

export const prepareAccountAdminTransactionInputSchema = z.discriminatedUnion("action", [
  z.object({
    action: z.literal("PAUSE"),
    ...networkSelectionShape,
  }),
  z.object({
    action: z.literal("UNPAUSE"),
    ...networkSelectionShape,
  }),
  z.object({
    action: z.literal("SET_EXECUTOR"),
    newExecutorAddress: evmAddressSchema,
    ...networkSelectionShape,
  }),
  z.object({
    action: z.literal("CANCEL_NONCE"),
    nonce: positiveIntegerStringSchema,
    ...networkSelectionShape,
  }),
  z.object({
    action: z.literal("SET_ALLOWED_TOKEN"),
    tokenAddress: evmAddressSchema,
    allowed: z.boolean(),
    ...networkSelectionShape,
  }),
  z.object({
    action: z.literal("WITHDRAW_NATIVE"),
    toAddress: evmAddressSchema,
    amountAtomic: positiveIntegerStringSchema,
    ...networkSelectionShape,
  }),
  z.object({
    action: z.literal("WITHDRAW_TOKEN"),
    tokenAddress: evmAddressSchema,
    toAddress: evmAddressSchema,
    amountAtomic: positiveIntegerStringSchema,
    ...networkSelectionShape,
  }),
]);

export type PrepareAccountAdminTransactionInput = z.infer<typeof prepareAccountAdminTransactionInputSchema>;
