import { test } from "node:test";
import assert from "node:assert/strict";
import {
  addScan,
  setCartQuantity,
  cartTotal,
  ScanGate,
  productSchema,
  checkoutSchema,
  OperationError,
} from "../src/lib/domain.ts";
const variant = {
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
test("barcode identifies the exact stocked variant", () =>
  assert.equal(addScan([], variant, 20)[0].variant.id, variant.id));
test("repeated scans increment the cart without deducting inventory", () => {
  const available = 20;
  const cart = addScan(addScan([], variant, available), variant, available);
  assert.equal(cart[0].qty, 2);
  assert.equal(available, 20);
});
test("cart cannot exceed available stock", () =>
  assert.throws(() => addScan(addScan([], variant, 1), variant, 1)));
test("scanner suppresses duplicate events and accepts deliberate repeats", () => {
  const gate = new ScanGate();
  assert.equal(gate.accept("123", 0), true);
  assert.equal(gate.accept("123", 20), false);
  assert.equal(gate.accept("123", 101), true);
  assert.equal(gate.accept("456", 102), true);
  assert.equal(gate.accept(" ", 200), false);
});
test("cash calculations use integer agorot and order-level tax", () =>
  assert.deepEqual(cartTotal([{ variant, qty: 2, discount: 98 }], 100, 1700), {
    subtotal: 3900,
    tax: 646,
    total: 4446,
  }));
test("fractional tax rounds once per order", () =>
  assert.equal(
    cartTotal(
      [{ variant: { ...variant, price: 1 }, qty: 3, discount: 0 }],
      0,
      1700,
    ).tax,
    1,
  ));
test("product and checkout validation reject negative prices and invalid carts", () => {
  assert.equal(
    productSchema.safeParse({ ...variant, cost: 100 }).success,
    true,
  );
  assert.equal(
    productSchema.safeParse({ ...variant, price: -1, cost: 100 }).success,
    false,
  );
  assert.equal(
    checkoutSchema.safeParse({ items: [], cash: -1 }).success,
    false,
  );
});
test("quantity typing is bounded and keeps line discounts valid", () => {
  const lines = [{ variant, qty: 2, discount: 2500 }];
  const adjusted = setCartQuantity(lines, variant.id, 1, 20);
  assert.equal(adjusted[0].qty, 1);
  assert.equal(adjusted[0].discount, 1999);
  assert.deepEqual(setCartQuantity(lines, variant.id, 0, 20), []);
  assert.throws(() => setCartQuantity(lines, variant.id, 21, 20));
  assert.throws(() => setCartQuantity(lines, variant.id, 1.5, 20));
});
test("uncertain checkout failures remain distinguishable from rolled back requests", () => {
  assert.equal(new OperationError("rollback", true).rolledBack, true);
  assert.equal(new OperationError("network", false).rolledBack, false);
});
