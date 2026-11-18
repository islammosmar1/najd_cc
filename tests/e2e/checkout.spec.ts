import { test, expect } from "@playwright/test";
import { emptyData } from "../../src/lib/types";

// Isolated UI contract check. Live PostgreSQL transactions are covered by test:live.
test("product scanner Enter does not save; two scans save one sale and refresh branch stock", async ({ page }) => {
  const business = "10000000-0000-4000-8000-000000000001";
  const branch = "10000000-0000-4000-8000-000000000002";
  const other = "10000000-0000-4000-8000-000000000003";
  const user = "10000000-0000-4000-8000-000000000004";
  const product = "10000000-0000-4000-8000-000000000005";
  const variant = "10000000-0000-4000-8000-000000000006";
  const sale = "10000000-0000-4000-8000-000000000007";
  const barcode = "0001234567890";
  const data = structuredClone(emptyData);
  Object.assign(data, {
    user_id: user, email_verified: true,
    businesses: [{ id: business, tax_bps: 0 }],
    branches: [{ id: branch, business_id: business, name: "فرع الستي سنتر" }, { id: other, business_id: business, name: "فرع شارع أبو بكر" }],
    memberships: [{ id: user, user_id: user, business_id: business, branch_id: null, role: "owner" }],
  });
  const commands: { action: string; payload: Record<string, unknown> }[] = [];
  await page.route("**/api/auth/**", route => route.fulfill({ json: {} }));
  await page.route("**/api/data?*", route => route.fulfill({ json: data }));
  await page.route("**/api/product?*", route => route.fulfill({ json: { cost: 1000, description: "" } }));
  await page.route("**/api/command", async route => {
    const command = route.request().postDataJSON();
    commands.push(command);
    if (command.action === "product") {
      data.products.push({ id: product, business_id: business, branch_id: branch, name: command.payload.name, active: true });
      data.product_variants.push({ id: variant, business_id: business, branch_id: branch, product_id: product, name: "", sku: command.payload.sku, price: command.payload.price, min_stock: 5 });
      data.product_barcodes.push({ id: variant, business_id: business, branch_id: branch, variant_id: variant, barcode });
      data.branch_inventory.push({ id: branch, business_id: business, branch_id: branch, variant_id: variant, quantity: 20 }, { id: other, business_id: business, branch_id: other, variant_id: variant, quantity: 15 });
      await route.fulfill({ json: { id: product } });
    } else if (command.action === "checkout") {
      data.branch_inventory[0].quantity = 18;
      await route.fulfill({ json: { id: sale, total: 5000, tax: 0, items: [{ variant_id: variant, name: "منتج اختبار", price: 2500, qty: 2, discount: 0 }] } });
    } else await route.fulfill({ status: 400, json: { error: "Unexpected command", rolledBack: true } });
  });
  await page.goto("/");
  await page.getByRole("button", { name: "تسجيل الدخول", exact: true }).first().click();
  await page.getByLabel("البريد الإلكتروني").fill("ui-test@example.invalid");
  await page.getByRole("button", { name: "إرسال رمز إلى البريد" }).click();
  await page.getByLabel("رمز الدخول").fill("123456");
  await page.getByRole("button", { name: "تأكيد الرمز والدخول" }).click();
  await page.getByRole("button", { name: /المنتجات والكميات/ }).click();
  await page.getByRole("button", { name: "إضافة منتج", exact: true }).first().click();
  const dialog = page.getByRole("dialog");
  await dialog.getByLabel("اسم المنتج").fill("منتج اختبار");
  const code = dialog.getByRole("textbox", { name: "باركود المنتج الجديد" });
  await code.fill(barcode); await code.press("Enter");
  expect(commands).toHaveLength(0);
  await expect(dialog.getByLabel("سعر البيع ₪")).toBeFocused();
  await dialog.getByLabel("سعر البيع ₪").fill("25");
  await dialog.getByRole("spinbutton", { name: "كمية فرع الستي سنتر", exact: true }).fill("20");
  await dialog.getByRole("spinbutton", { name: "كمية فرع شارع أبو بكر", exact: true }).fill("15");
  await dialog.getByRole("button", { name: "حفظ المنتج والكميات" }).click();
  await expect(page.getByRole("cell", { name: "منتج اختبار " + barcode, exact: true })).toBeVisible();
  expect(commands[0].payload.barcode).toBe(barcode);
  await page.getByRole("button", { name: /^البيع/ }).click();
  const scanner = page.getByRole("textbox", { name: "باركود المنتج", exact: true });
  await scanner.fill(barcode); await scanner.press("Enter");
  await page.waitForTimeout(160);
  await scanner.fill(barcode); await scanner.press("Enter");
  await expect(page.getByRole("spinbutton", { name: "كمية منتج اختبار", exact: true })).toHaveValue("2");
  expect(commands.filter(c => c.action === "checkout")).toHaveLength(0);
  await page.getByRole("button", { name: /تأكيد البيع وخصم الكمية/ }).click();
  await expect(page.getByRole("heading", { name: "تم إصدار الإيصال" })).toBeVisible();
  const checkouts = commands.filter(c => c.action === "checkout");
  expect(checkouts).toHaveLength(1);
  expect(checkouts[0].payload).toMatchObject({ branch_id: branch, cash: 5000, items: [{ variant_id: variant, qty: 2, discount: 0 }] });
  await page.getByRole("button", { name: "بيع جديد", exact: true }).click();
  await page.getByRole("button", { name: /المنتجات والكميات/ }).click();
  const row = page.getByRole("row").filter({ hasText: "منتج اختبار" });
  await expect(row).toContainText("18");
  await expect(row).toContainText("15");
  await page.screenshot({ path: ".local/najd-simple-inventory.png", fullPage: true });
});
