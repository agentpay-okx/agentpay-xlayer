export function createApprovalPhrase(paymentIntentId: string): string {
  return `APPROVE ${paymentIntentId}`;
}

export function createApprovalInstruction(paymentIntentId: string): string {
  return `To approve, reply exactly:\n${createApprovalPhrase(paymentIntentId)}`;
}
