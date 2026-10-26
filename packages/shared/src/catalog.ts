import type { Catalog, Category, Item } from './types';

export function childCategories(catalog: Catalog, parentId: string | null): Category[] {
  return catalog.categories
    .filter((c) => c.parentId === parentId)
    .sort((a, b) => a.sort - b.sort || a.name.localeCompare(b.name));
}

export function itemsIn(catalog: Catalog, categoryId: string): Item[] {
  return catalog.items
    .filter((i) => i.categoryId === categoryId)
    .sort((a, b) => a.sort - b.sort || a.name.localeCompare(b.name));
}

/** Subtitle on a category tile: "9 items" or, for a category of sub-groups, "3 groups". */
export function categorySummary(catalog: Catalog, categoryId: string): string {
  const children = childCategories(catalog, categoryId);
  const direct = itemsIn(catalog, categoryId);
  if (children.length > 0 && direct.length === 0) {
    return `${children.length} ${children.length === 1 ? 'group' : 'groups'}`;
  }
  return `${direct.length} ${direct.length === 1 ? 'item' : 'items'}`;
}

export function itemGroups(items: Item[]): string[] {
  const seen: string[] = [];
  for (const i of items) if (i.group && !seen.includes(i.group)) seen.push(i.group);
  return seen;
}

export function minPrice(item: Item): number {
  return Math.min(...item.variants.map((v) => v.priceCents));
}

export function categoryPath(catalog: Catalog, categoryId: string): Category[] {
  const path: Category[] = [];
  let cur = catalog.categories.find((c) => c.id === categoryId);
  while (cur) {
    path.unshift(cur);
    cur = cur.parentId ? catalog.categories.find((c) => c.id === cur!.parentId) : undefined;
  }
  return path;
}
