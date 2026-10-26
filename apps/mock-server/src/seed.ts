import type { Catalog, Category, Item, Merchant, TerminalSettings } from '@dynkle/shared';

export const ADMIN_CODE = '123456';

export const merchant: Merchant = {
  id: 'mer_dynkle_cafe',
  name: 'Dynkle Café',
  legalName: 'Dynkle Café Pty Ltd',
  abn: '51 824 753 556',
  address: '12 Chapel St, Windsor VIC 3181',
  phone: '(03) 9510 0000',
  email: 'hello@dynklecafe.com.au',
  walletAddress: '9wQd…Ld2c',
};

export const defaultSettings: TerminalSettings = {
  tipsEnabled: true,
  tipPresets: [10, 15, 20],
  currency: 'AUD',
  soundEnabled: true,
  priceLockSeconds: 90,
};

const cat = (id: string, name: string, sort: number, parentId: string | null = null): Category => ({
  id,
  name,
  parentId,
  sort,
});

let n = 0;
const item = (
  categoryId: string,
  name: string,
  prices: Array<[string, number]>,
  group?: string,
): Item => {
  const id = `itm_${++n}`;
  return {
    id,
    categoryId,
    name,
    group,
    sort: n,
    variants: prices.map(([vName, priceCents], i) => ({ id: `${id}_v${i + 1}`, name: vName, priceCents })),
  };
};

const sml = (s: number, m: number, l: number): Array<[string, number]> => [
  ['Small', s],
  ['Medium', m],
  ['Large', l],
];
const one = (p: number): Array<[string, number]> => [['Regular', p]];

export function seedCatalog(): Catalog {
  n = 0;
  const categories = [
    cat('cat_coffee', 'Coffee', 1),
    cat('cat_tea', 'Tea', 2),
    cat('cat_cold', 'Cold drinks', 3),
    cat('cat_juice', 'Juice', 4),
    cat('cat_food', 'Food', 5),
    cat('cat_pastries', 'Pastries', 6),
    cat('cat_food_breads', 'Breads', 1, 'cat_food'),
    cat('cat_food_sandwiches', 'Sandwiches', 2, 'cat_food'),
    cat('cat_food_bowls', 'Bowls', 3, 'cat_food'),
  ];
  const items = [
    item('cat_coffee', 'Flat white', sml(480, 550, 620), 'Milk coffee'),
    item('cat_coffee', 'Latte', sml(480, 550, 620), 'Milk coffee'),
    item('cat_coffee', 'Cappuccino', sml(480, 550, 620), 'Milk coffee'),
    item('cat_coffee', 'Mocha', sml(530, 600, 670), 'Specialty'),
    item('cat_coffee', 'Chai latte', sml(500, 570, 640), 'Specialty'),
    item('cat_coffee', 'Long black', [['Small', 420], ['Large', 520]], 'Black'),
    item('cat_coffee', 'Espresso', one(380), 'Black'),
    item('cat_coffee', 'Magic', one(520), 'Milk coffee'),
    item('cat_coffee', 'Piccolo', one(450), 'Milk coffee'),
    item('cat_tea', 'English breakfast', sml(450, 500, 550)),
    item('cat_tea', 'Earl grey', sml(450, 500, 550)),
    item('cat_tea', 'Peppermint', sml(450, 500, 550)),
    item('cat_tea', 'Green tea', sml(450, 500, 550)),
    item('cat_tea', 'Chamomile', sml(450, 500, 550)),
    item('cat_tea', 'Iced tea', [['Regular', 550], ['Large', 650]]),
    item('cat_cold', 'Iced latte', [['Regular', 600], ['Large', 700]]),
    item('cat_cold', 'Iced long black', [['Regular', 550], ['Large', 650]]),
    item('cat_cold', 'Cold brew', [['Regular', 600], ['Large', 700]]),
    item('cat_cold', 'Iced chocolate', one(700)),
    item('cat_cold', 'Milkshake', one(800)),
    item('cat_cold', 'Sparkling water', one(400)),
    item('cat_cold', 'Lemonade', one(450)),
    item('cat_cold', 'Kombucha', one(600)),
    item('cat_juice', 'Orange', [['Regular', 700], ['Large', 850]]),
    item('cat_juice', 'Apple', [['Regular', 700], ['Large', 850]]),
    item('cat_juice', 'Green', [['Regular', 800], ['Large', 950]]),
    item('cat_juice', 'Watermelon', [['Regular', 750], ['Large', 900]]),
    item('cat_juice', 'Carrot & ginger', [['Regular', 750], ['Large', 900]]),
    item('cat_food_breads', 'Banana bread', one(550)),
    item('cat_food_breads', 'Sourdough toast', one(800)),
    item('cat_food_sandwiches', 'Ham & cheese toastie', one(1200)),
    item('cat_food_sandwiches', 'Chicken club', one(1450)),
    item('cat_food_bowls', 'Acai bowl', one(1600)),
    item('cat_pastries', 'Croissant', one(600)),
    item('cat_pastries', 'Almond croissant', one(750)),
    item('cat_pastries', 'Pain au chocolat', one(650)),
    item('cat_pastries', 'Cinnamon scroll', one(650)),
    item('cat_pastries', 'Danish', one(650)),
    item('cat_pastries', 'Muffin', one(550)),
    item('cat_pastries', 'Friand', one(500)),
  ];
  return { categories, items, updatedAt: new Date().toISOString() };
}
