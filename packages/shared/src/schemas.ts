import { z } from 'zod';

/**
 * Request bodies for the dashboard API. The server validates every body with
 * these, and the request types used by the terminal are inferred from them, so
 * both sides share one definition.
 */

const text = (max = 200) => z.string().max(max);
const cents = z.number().finite();

export const orderLineSchema = z.object({
  id: text(64),
  kind: z.enum(['item', 'custom']),
  itemId: text(64).optional(),
  variantId: text(64).optional(),
  name: text(),
  detail: text(),
  unitCents: cents,
  qty: z.number().int().positive(),
});

export const paymentMethodSchema = z.object({
  wallet: z.enum(['DYNK app', 'Phantom', 'Solflare', 'Backpack']),
  channel: z.enum(['tap', 'qr', 'bluetooth']),
});

export const createPaymentSchema = z.object({
  lines: z.array(orderLineSchema).max(500).default([]),
  subtotalCents: cents,
  tipCents: cents.default(0),
  reference: text().optional(),
});

export const pairingClaimSchema = z.object({
  code: text(16),
  tillName: text(60).optional(),
});

export const devPairingClaimSchema = pairingClaimSchema.partial();

export const adminVerifySchema = z.object({ pin: z.union([z.string(), z.number()]).transform(String) });

export const addCategorySchema = z.object({
  name: text(80),
  parentId: text(64).nullable().optional(),
});

export const updateCategorySchema = z.object({
  name: text(80).optional(),
  sort: z.number().int().optional(),
});

export const variantInputSchema = z.object({
  id: text(64).optional(),
  name: text(60).optional(),
  priceCents: cents,
});

export const addItemSchema = z.object({
  categoryId: text(64),
  name: text(120),
  group: text(60).optional(),
  variants: z.array(variantInputSchema).max(20),
});

export const updateItemSchema = addItemSchema.partial().extend({ sort: z.number().int().optional() });

export const remoteChargeSchema = z.object({
  tillId: text(64).optional(),
  amountCents: cents,
  reference: text().optional(),
  sentBy: text(80).optional(),
});

export const solanaPayRequestSchema = z.object({ account: text(64) });

export const devConnectSchema = paymentMethodSchema.partial();
export const devDeclineSchema = z.object({ reason: text().optional() });
export const renameTillSchema = z.object({ name: text(60).min(1) });
export const softwareUpdateSchema = z.object({ version: text(32).optional() });

export const settingsPatchSchema = z
  .object({
    tipsEnabled: z.boolean(),
    tipPresets: z.array(z.number().min(0).max(100)).max(6),
    soundEnabled: z.boolean(),
    priceLockSeconds: z.number().positive().max(900),
    dynkPerAud: z.number().positive().max(1e9),
  })
  .partial();

export const logEntrySchema = z.object({
  at: text(40),
  level: z.enum(['debug', 'info', 'warn', 'error']),
  message: text(2000),
  context: z.record(z.string(), z.unknown()).optional(),
});

export const uploadLogsSchema = z.object({ entries: z.array(logEntrySchema).max(500) });

export type CreatePaymentRequest = z.input<typeof createPaymentSchema>;
export type VariantInput = z.infer<typeof variantInputSchema>;
export type AddItemRequest = z.infer<typeof addItemSchema>;
export type UpdateItemRequest = z.infer<typeof updateItemSchema>;
export type RemoteChargeRequest = z.infer<typeof remoteChargeSchema>;
export type LogEntry = z.infer<typeof logEntrySchema>;

/** Header the terminal sends with POST /payments so a retried request can't create a second charge. */
export const IDEMPOTENCY_HEADER = 'idempotency-key';
/** Header the terminal sends on every request with its app version. */
export const APP_VERSION_HEADER = 'x-dynkle-app-version';
