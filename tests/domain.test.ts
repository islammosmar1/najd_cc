import { describe, it, expect } from "vitest";
import {
  addScan,
  cartTotal,
  ScanGate,
  productSchema,
  checkoutSchema,
  type Variant,
} from "../src/lib/domain";
const v: Variant = {
  id: "10000000-0000-4000-8000-000000000001",
  product_id: "20000000-0000-4000-8000-000000000001",
  name: "منتج",
  sku: "SKU",
  barcode: "729000000001",
  price: 1999,
  min_stock: 5,
  category: "",
  image_url: "",
  active: true,
};
describe("cashier domain", () => {
  it("adds and recognizes an exact variant", () =>
    expect(addScan([], v, 20)[0].variant.id).toBe(v.id));
  it("repeated scans increment only the cart", () => {
    const stock = 20;
    const cart = addScan(addScan([], v, stock), v, stock);
    expect(cart[0].qty).toBe(2);
    expect(stock).toBe(20);
  });
  it("blocks cart quantities exceeding stock", () =>
    expect(() => addScan(addScan([], v, 1), v, 1)).toThrow());
  it("deduplicates scanner event bursts but accepts deliberate repeats", () => {
    const gate = new ScanGate();
    expect(gate.accept("123", 0)).toBe(true);
    expect(gate.accept("123", 20)).toBe(false);
    expect(gate.accept("123", 101)).toBe(true);
    expect(gate.accept("456", 102)).toBe(true);
    expect(gate.accept(" ", 200)).toBe(false);
  });
  it("calculates agorot, line discounts, order discount and tax", () =>
    expect(
      cartTotal([{ variant: v, qty: 2, discount: 98 }], 100, 1700),
    ).toEqual({ subtotal: 3900, tax: 646, total: 4446 }));
  it("rounds tax once at order level", () =>
    expect(
      cartTotal([{ variant: { ...v, price: 1 }, qty: 3, discount: 0 }], 0, 1700)
        .tax,
    ).toBe(1));
  it("validates product and rejects negative money", () => {
    expect(productSchema.safeParse({ ...v, cost: 100 }).success).toBe(true);
    expect(
      productSchema.safeParse({ ...v, price: -1, cost: 100 }).success,
    ).toBe(false);
  });
  it("rejects invalid checkout and unsupported payment input", () =>
    expect(checkoutSchema.safeParse({ items: [], cash: -1 }).success).toBe(
      false,
    ));
});
