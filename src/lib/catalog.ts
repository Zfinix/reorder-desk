import type { PriceItem } from "../types.ts";

const score = (item: PriceItem, query: string) => {
  const q = query.toLowerCase().trim();
  if (item.sku.toLowerCase() === q) return 100;
  if (item.name.toLowerCase() === q) return 90;
  if (item.aliases.includes(q)) return 80;
  if (item.name.toLowerCase().includes(q)) return 60;
  if (item.aliases.some((a) => a.includes(q) || q.includes(a))) return 50;
  return 0;
};

type Resolved =
  | { ok: true; item: PriceItem }
  | { ok: false; reason: "not_in_price_list" }
  | { ok: false; reason: "ambiguous"; candidates: string[] };

export const resolveItem = (priceList: PriceItem[], query: string): Resolved => {
  const ranked = priceList
    .map((item) => ({ item, score: score(item, query) }))
    .filter((entry) => entry.score > 0)
    .sort((a, b) => b.score - a.score);
  if (ranked.length === 0) return { ok: false, reason: "not_in_price_list" };
  if (ranked.length > 1 && ranked[0].score === ranked[1].score) {
    return { ok: false, reason: "ambiguous", candidates: ranked.map((r) => r.item.name) };
  }
  return { ok: true, item: ranked[0].item };
};

export const catalogue = (priceList: PriceItem[]) =>
  priceList.map(({ sku, name, pack, unit_price, stock_cases }) => ({
    sku,
    name,
    pack,
    unit_price,
    in_stock: stock_cases,
  }));
