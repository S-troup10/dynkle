import type { Catalog, Category, Item, OrderLine, PaymentSession, PaymentStatus } from '@dynkle/shared';

/**
 * Shapes returned by the Dynkle API (src/devices/deviceRoutes.js, deviceHub.js)
 * and how they become the terminal's own `PaymentSession` / `Catalog` model.
 * The backend's order/device status enum is collapsed to the device-facing
 * one in `deviceStatus()` (src/devices/deviceHub.js) before it ever reaches
 * us, so we only need to map that smaller set.
 */

export interface BackendOrderDto {
  id: string;
  totalCents: number;
  currency: string;
  status: 'OPEN' | 'PROCESSING' | 'PAID' | 'EXPIRED' | 'CANCELLED' | 'FAILED' | 'REFUNDED';
  expiresAt: string;
  ttlSeconds: number;
  claimed: boolean;
  paymentUrl: string;
  acceptedTokens: string[];
  baseAmountCents?: number;
  tipCents?: number;
  token?: string | null;
  txHash?: string | null;
}

export function mapOrderStatus(status: BackendOrderDto['status']): PaymentStatus {
  switch (status) {
    case 'OPEN':
      return 'armed';
    case 'PROCESSING':
      return 'confirming';
    case 'PAID':
    case 'REFUNDED':
      return 'paid';
    case 'EXPIRED':
      return 'expired';
    case 'CANCELLED':
      return 'cancelled';
    case 'FAILED':
      return 'failed';
  }
}

/**
 * `lines` and `tillId` aren't on the backend's order DTO (it only tracks
 * cents, not line items) — pass through what the terminal already knows
 * about the sale it rang up.
 */
export function mapOrderToPayment(
  order: BackendOrderDto,
  context: { tillId: string; lines: OrderLine[]; subtotalCents: number; reference?: string; source: 'terminal' | 'dashboard' },
): PaymentSession {
  const tipCents = order.tipCents ?? Math.max(0, order.totalCents - context.subtotalCents);
  return {
    id: order.id,
    tillId: context.tillId,
    status: mapOrderStatus(order.status),
    source: context.source,
    reference: context.reference,
    lines: context.lines,
    subtotalCents: context.subtotalCents,
    tipCents,
    totalCents: order.totalCents,
    gstCents: 0,
    customerFeeCents: 0,
    createdAt: new Date().toISOString(),
    expiresAt: order.expiresAt,
    qrUrl: order.paymentUrl,
    ndefUrl: order.paymentUrl,
    solanaPayUrl: order.paymentUrl,
    txSignature: order.txHash ?? undefined,
    completedAt: order.status === 'PAID' ? new Date().toISOString() : undefined,
  };
}

export interface BackendProductDto {
  id: string;
  name: string;
  category: string;
  priceCents: number;
  description: string | null;
  icon: string | null;
  popular: boolean;
  variants: { name: string; priceCents: number }[];
}

export interface BackendCatalogDto {
  currency: string;
  categories: string[];
  products: BackendProductDto[];
}

/**
 * The backend's catalog is flat (a category is just a string on a product);
 * our `Catalog` model supports a category tree, so every backend category
 * becomes a top-level one with no children.
 */
export interface BackendOrderItemInput {
  productId: string;
  variants?: string[];
  qty: number;
}

/**
 * The backend re-prices every line itself from `productId` + variant names
 * (src/devices/pricing.js), it doesn't trust client-sent amounts. That only
 * works when every line is a real catalog item — a custom/keypad amount (no
 * `itemId`) has nothing for the backend to price, so callers should fall
 * back to sending `totalCents` directly in that case.
 */
export function linesToOrderItems(lines: OrderLine[]): BackendOrderItemInput[] | null {
  const items: BackendOrderItemInput[] = [];
  for (const line of lines) {
    if (line.kind !== 'item' || !line.itemId) return null;
    const variants = line.variantId && line.variantId.includes(':') ? [line.variantId.slice(line.itemId.length + 1)] : [];
    items.push({ productId: line.itemId, variants, qty: line.qty });
  }
  return items;
}

export function mapCatalog(dto: BackendCatalogDto): Catalog {
  const categories: Category[] = dto.categories.map((name, sort) => ({ id: name, name, parentId: null, sort }));
  const items: Item[] = dto.products.map((p, sort) => ({
    id: p.id,
    categoryId: p.category,
    name: p.name,
    variants:
      p.variants.length > 0
        ? p.variants.map((v) => ({ id: `${p.id}:${v.name}`, name: v.name, priceCents: p.priceCents + v.priceCents }))
        : [{ id: p.id, name: 'Regular', priceCents: p.priceCents }],
    sort,
  }));
  return { categories, items, updatedAt: new Date().toISOString() };
}
