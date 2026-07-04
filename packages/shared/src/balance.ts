import { z } from "zod";

import { networkSelectionShape } from "./chains.ts";
import { DEFAULT_STABLE_TOKEN_SYMBOLS, stableTokenSymbolSchema } from "./tokens.ts";

export const getBalanceInputSchema = z.object({
  tokenSymbols: z.array(stableTokenSymbolSchema).min(1).default([...DEFAULT_STABLE_TOKEN_SYMBOLS]),
  ...networkSelectionShape,
});

export type GetBalanceInput = z.input<typeof getBalanceInputSchema>;
export type ParsedGetBalanceInput = z.output<typeof getBalanceInputSchema>;
