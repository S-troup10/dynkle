import type { Item, OrderLine, Variant } from '@dynkle/shared';

let seq = 0;
const lineId = () => `ln_${Date.now().toString(36)}_${(seq++).toString(36)}`;

export function addItemLine(lines: OrderLine[], item: Item, variant: Variant, qty: number, detail?: string): OrderLine[] {
  const existing = lines.find((l) => l.kind === 'item' && l.itemId === item.id && l.variantId === variant.id);
  if (existing) return lines.map((l) => (l === existing ? { ...l, qty: l.qty + qty } : l));
  const single = item.variants.length === 1;
  return [
    ...lines,
    {
      id: lineId(),
      kind: 'item',
      itemId: item.id,
      variantId: variant.id,
      name: item.name,
      detail: detail ?? (single ? '' : variant.name),
      unitCents: variant.priceCents,
      qty,
    },
  ];
}

export function addCustomLine(lines: OrderLine[], cents: number): OrderLine[] {
  if (cents <= 0) return lines;
  return [...lines, { id: lineId(), kind: 'custom', name: 'Custom amount', detail: 'Keyed in', unitCents: cents, qty: 1 }];
}

export function changeQty(lines: OrderLine[], id: string, delta: number): OrderLine[] {
  return lines.flatMap((l) => {
    if (l.id !== id) return [l];
    const qty = l.qty + delta;
    return qty > 0 ? [{ ...l, qty }] : [];
  });
}

export function removeLine(lines: OrderLine[], id: string): OrderLine[] {
  return lines.filter((l) => l.id !== id);
}

export function cartTotal(lines: OrderLine[]): number {
  return lines.reduce((s, l) => s + l.unitCents * l.qty, 0);
}

export function cartCount(lines: OrderLine[]): number {
  return lines.reduce((s, l) => s + l.qty, 0);
}

export function qtyOfItem(lines: OrderLine[], itemId: string): number {
  return lines.filter((l) => l.itemId === itemId).reduce((s, l) => s + l.qty, 0);
}
