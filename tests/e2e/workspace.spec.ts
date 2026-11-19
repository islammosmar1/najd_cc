import { test, expect } from "@playwright/test";
test("simple Arabic desk shows the two named branches and protects checkout", async ({
  page,
}) => {
  await page.goto("/");
  await expect(
    page.getByRole("heading", { name: "فاتورة بيع جديدة" }),
  ).toBeVisible();
  await expect(page.getByText("مخزون إجمالي واحد", { exact: true })).toBeVisible();
  await expect(page.getByRole("button", {name:/فرع الستي سنتر|فرع شارع أبو بكر/})).toHaveCount(0);
  await expect(
    page.getByRole("button", { name: "تأكيد البيع وخصم الكمية" }),
  ).toBeDisabled();
  const input = page.getByRole("textbox", {
    name: "باركود المنتج",
    exact: true,
  });
  await expect(input).toBeFocused();
  await input.fill("UNKNOWN-BARCODE");
  await input.press("Enter");
  await expect(
    page.getByText("الباركود غير معروف. ابحث عن المنتج أو أضفه أولاً."),
  ).toBeVisible();
  const origin = new URL(page.url()).origin;
  const response = await page.request.post("/api/command", {
    headers: { Origin: origin },
    data: { action: "checkout", payload: {} },
  });
  expect([401, 503]).toContain(response.status());
  const forbidden = await page.request.post("/api/command", {
    headers: { Origin: "https://untrusted.example" },
    data: { action: "checkout", payload: {} },
  });
  expect(forbidden.status()).toBe(403);
  await page.screenshot({ path: ".local/najd-desktop.png", fullPage: true });
});
test("login offers an email code without requesting a message automatically", async ({
  page,
}) => {
  await page.goto("/");
  const login = page
    .getByRole("button", { name: "تسجيل الدخول", exact: true })
    .first();
  test.skip(
    await login.isDisabled(),
    "Database not configured in this environment",
  );
  await login.click();
  await expect(
    page.getByRole("heading", { name: "دخول آمن لحساب najd" }),
  ).toBeVisible();
  await expect(page.getByLabel("كلمة المرور",{exact:true})).toBeVisible();
  await page.getByRole("button",{name:"الدخول برمز يصل إلى البريد",exact:true}).click();
  await expect(page.getByRole("button", { name: "إرسال رمز إلى البريد" })).toBeVisible();
  await expect(page.getByLabel("البريد الإلكتروني")).toBeVisible();
});
test("mobile RTL desk has only sale, products and sales history", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/");
  await expect(page.locator("html")).toHaveAttribute("dir", "rtl");
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await page.getByRole("button", { name: /المنتجات والكميات/ }).click();
  await expect(
    page.getByRole("heading", { name: "المنتجات والكميات", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("textbox", { name: "ابحث عن منتج أو امسح باركوده" }),
  ).toBeVisible();
  await page.screenshot({
    path: ".local/najd-stock-mobile.png",
    fullPage: true,
  });
  await page.getByRole("button", { name: /سجل المبيعات/ }).click();
  await expect(page.getByRole("heading", { name: "سجل المبيعات", exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: /الإعدادات والإدارة|الورديات|المصاريف|الحسابات المبيعات/ })).toHaveCount(0);
});
test("real authenticated cashier workflow (explicit test account only)", async ({
  page,
}) => {
  test.skip(
    !process.env.E2E_EMAIL ||
      !process.env.E2E_PASSWORD ||
      !process.env.E2E_BARCODE,
    "Requires a real authorized Neon test account and product; makes a real sale.",
  );
  await page.goto("/");
  await page
    .getByRole("button", { name: "تسجيل الدخول", exact: true })
    .first()
    .click();
  await page.getByLabel("البريد الإلكتروني").fill(process.env.E2E_EMAIL!);
  await page.getByLabel("كلمة المرور").fill(process.env.E2E_PASSWORD!);
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "تسجيل الدخول", exact: true })
    .click();
  await expect(
    page.getByText("أهلًا بك في najd", { exact: true }),
  ).toBeVisible();
  const input = page.getByRole("textbox", {
    name: "باركود المنتج",
    exact: true,
  });
  for (let i = 0; i < 2; i++) {
    await input.fill(process.env.E2E_BARCODE!);
    await input.press("Enter");
    await page.waitForTimeout(150);
  }
  await expect(page.locator(".quantity input").first()).toHaveValue("2");
  await page.getByRole("button", { name: "تأكيد البيع وخصم الكمية" }).click();
  await expect(
    page.getByRole("heading", { name: "تم إصدار الإيصال" }),
  ).toBeVisible();
  await expect(page.locator("#receipt")).toContainText("najd");
});
