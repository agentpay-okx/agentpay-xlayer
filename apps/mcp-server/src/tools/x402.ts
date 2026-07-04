import {
  parseX402PaymentRequired,
  type ParsedX402PaymentRequired,
  type ParseX402PaymentRequiredInput,
  parseX402PaymentRequiredInputSchema,
} from "@agentpay-ai/shared";

export interface ParseX402PaymentRequiredOutput extends ParsedX402PaymentRequired {
  status: "PARSED";
  instructionToAgent: string;
}

export async function parseX402PaymentRequiredForAgent(
  rawInput: ParseX402PaymentRequiredInput,
): Promise<ParseX402PaymentRequiredOutput> {
  const parsed = parseX402PaymentRequired(rawInput);

  return {
    status: "PARSED",
    ...parsed,
    instructionToAgent:
      "Review the x402 requirement with the user. AgentPay can prepare the stablecoin transfer with paymentInput, but standard x402 exact endpoints still require a PAYMENT-SIGNATURE payload from an x402-capable signer.",
  };
}

export const parseX402PaymentRequiredTool = {
  name: "parse_x402_payment_required",
  description: "Parse a v2 x402 PAYMENT-REQUIRED object or header into AgentPay payment fields.",
  inputSchema: {
    type: "object",
    additionalProperties: false,
    required: ["paymentRequired"],
    properties: {
      paymentRequired: {
        anyOf: [{ type: "string" }, { type: "object" }],
      },
      sourceTokenSymbol: { type: "string", enum: ["USDC", "USDT"] },
    },
  },
} as const;

export function createParseX402PaymentRequiredHandler() {
  return (input: ParseX402PaymentRequiredInput) => parseX402PaymentRequiredForAgent(input);
}

export { parseX402PaymentRequiredInputSchema };
