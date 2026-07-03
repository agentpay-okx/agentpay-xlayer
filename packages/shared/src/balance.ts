import { z } from "zod";

import { STABLE_TOKEN_SYMBOLS, stableTokenSymbolSchema } from "./tokens.ts";

export const getBalanceInputSchema = z.object({
  tokenSymbols: z.array(stableTokenSymbolSchema).min(1).default([...STABLE_TOKEN_SYMBOLS]),
});

export type GetBalanceInput = z.input<typeof getBalanceInputSchema>;
export type ParsedGetBalanceInput = z.output<typeof getBalanceInputSchema>;
