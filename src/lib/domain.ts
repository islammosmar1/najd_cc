import { z } from "zod";
export function normalizeBarcode(value: string) {
  return value.normalize("NFKC")
    .replace(/[\u200B-\u200F\u202A-\u202E\u2066-\u2069\uFEFF]/g, "")
    .replace(/[٠-٩۰-۹]/g, digit => String(digit.charCodeAt(0) - (digit <= "٩" ? 0x660 : 0x6f0)))
    .trim();
}
export class OperationError extends Error {
  readonly rolledBack: boolean;
  constructor(message: string, rolledBack: boolean) {
    super(message);
    this.rolledBack = rolledBack;
  }
}
export const productSchema = z.object({
  name: z.string().trim().min(2).max(160),
  sku: z.string().trim().min(1).max(80),
  barcode: z.string().trim().max(80).default("").transform(normalizeBarcode),
  price: z.coerce.number().int().min(0).max(100000000),
  cost: z.coerce.number().int().min(0).max(100000000),
  min_stock: z.coerce.number().int().min(0),
  category: z.string().max(80).default(""),
  image_url: z.string().max(160000).refine(value => !value || /^https:\/\//.test(value) || /^data:image\/(jpeg|png|webp);base64,[A-Za-z0-9+/]+={0,2}$/.test(value)).default(""),
  description: z.string().max(2000).default(""),
});
export const lineSchema = z.object({
  variant_id: z.uuid(),
  qty: z.number().int().min(1).max(100000),
  discount: z.number().int().min(0).default(0),
});
export const checkoutSchema = z.object({
  branch_id: z.uuid(),
  shift_id: z.uuid().optional(),
  key: z.uuid(),
  items: z.array(lineSchema).min(1).max(200),
  discount: z.number().int().min(0).default(0),
  cash: z.number().int().min(0),
});
export type Variant = {
  id: string;
  product_id: string;
  name: string;
  sku: string;
  barcode: string;
  price: number;
  min_stock: number;
  category: string;
  image_url: string;
  active: boolean;
};
export type CartLine = { variant: Variant; qty: number; discount: number };
export function setCartQuantity(
  lines: CartLine[],
  id: string,
  quantity: number,
  available: number,
) {
  if (!Number.isInteger(quantity) || quantity < 0)
    throw Error("أدخل عددًا صحيحًا للكمية");
  if (quantity > available) throw Error("الكمية المتوفرة غير كافية");
  return quantity === 0
    ? lines.filter((l) => l.variant.id !== id)
    : lines.map((l) =>
        l.variant.id === id
          ? {
              ...l,
              qty: quantity,
              discount: Math.min(l.discount, quantity * l.variant.price),
            }
          : l,
      );
}
export function cartTotal(lines: CartLine[], discount = 0, taxBps = 0) {
  const subtotal = lines.reduce(
    (sum, l) => sum + l.qty * l.variant.price - l.discount,
    0,
  );
  const taxable = Math.max(0, subtotal - discount);
  const tax = Math.round((taxable * taxBps) / 10000);
  return { subtotal, tax, total: taxable + tax };
}
export function addScan(
  lines: CartLine[],
  variant: Variant,
  available: number,
) {
  const found = lines.find((l) => l.variant.id === variant.id);
  if ((found?.qty ?? 0) >= available) throw Error("الكمية المتوفرة غير كافية");
  return found
    ? lines.map((l) =>
        l.variant.id === variant.id ? { ...l, qty: l.qty + 1 } : l,
      )
    : [...lines, { variant, qty: 1, discount: 0 }];
}
export class ScanGate {
  private last = "";
  private at = -Infinity;
  accept(code: string, time: number) {
    const clean = code.trim();
    if (!clean || (this.last === clean && time - this.at < 100)) return false;
    this.last = clean;
    this.at = time;
    return true;
  }
}
// A visible barcode is one presentation, regardless of the number of frames.
// Re-arm only after it has been absent for a full second.
export class CameraScanGate {
  private code = "";
  private seen = 0;
  accept(text: string, now: number) {
    const code = normalizeBarcode(text);
    if (!code) return false;
    const duplicate = this.code === code;
    this.code = code;
    this.seen = now;
    return !duplicate;
  }
  absent(now: number) {
    if (now - this.seen >= 1000) this.code = "";
  }
  reset() { this.code = ""; }
}
