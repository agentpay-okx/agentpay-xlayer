import { z } from "zod";

export const trackPaymentInputSchema = z.object({
  paymentIntentId: z.string().trim().min(1),
});

export type TrackPaymentInput = z.infer<typeof trackPaymentInputSchema>;

export const listTransactionsInputSchema = z.object({
  limit: z.number().int().min(1).max(50).default(10),
});

export type ListTransactionsInput = z.input<typeof listTransactionsInputSchema>;
export type ParsedListTransactionsInput = z.output<typeof listTransactionsInputSchema>;

export const listPaymentEventsInputSchema = z.object({
  paymentIntentId: z.string().trim().min(1),
  limit: z.number().int().min(1).max(50).default(20),
});

export type ListPaymentEventsInput = z.input<typeof listPaymentEventsInputSchema>;
export type ParsedListPaymentEventsInput = z.output<typeof listPaymentEventsInputSchema>;

export interface PaymentEventRecord {
  id: string;
  paymentIntentId: string;
  eventType: string;
  message?: string;
  metadata: Record<string, unknown>;
  createdAt: string;
}
