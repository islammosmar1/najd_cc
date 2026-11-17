import { test, expect } from "@playwright/test";
test("Arabic setup renders and sales stay disabled without credentials", async ({
  page,
}) => {
  await page.goto("/");
  test.skip(
    (await page
      .getByText("أهلًا بك في najd. لنبدأ بربط مساحة عملك.")
      .count()) === 0,
    "Configured deployment: use live cashier workflow instead.",
  );
  await expect(
    page.getByRole("heading", { name: "كل ما تحتاجه، في نظرة واحدة" }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "عملية بيع جديدة" }),
  ).toBeDisabled();
  await page.getByRole("button", { name: "إعداد الاتصال" }).click();
  await expect(page.getByText("NEXT_PUBLIC_SUPABASE_URL=…")).toBeVisible();
  await page.getByRole("button", { name: "إغلاق", exact: true }).click();
  await page.screenshot({
    path: ".local/dashboard-desktop.png",
    fullPage: true,
  });
  await page
    .getByRole("button", { name: "نقطة البيع", exact: false })
    .first()
    .click();
  await page
    .getByRole("textbox", { name: "باركود المنتج" })
    .fill("UNKNOWN-BARCODE");
  await page.getByRole("textbox", { name: "باركود المنتج" }).press("Enter");
  await expect(
    page.getByText("الباركود غير معروف. ابحث عن المنتج أو أضفه أولاً."),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "إتمام الدفع" }),
  ).toBeDisabled();
  const response = await page.request.post("/api/command", {
    headers: { Origin: "http://127.0.0.1:3000" },
    data: { action: "checkout", payload: {} },
  });
  expect(response.status()).toBe(503);
  const forbidden=await page.request.post('/api/command',{headers:{Origin:'https://untrusted.example'},data:{action:'checkout',payload:{}}});
  expect(forbidden.status()).toBe(403);
});
test("mobile navigation and RTL fit the viewport", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/");
  await expect(page.locator("html")).toHaveAttribute("dir", "rtl");
  await expect(
    page.getByRole("heading", { name: "كل ما تحتاجه، في نظرة واحدة" }),
  ).toBeVisible();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await page.getByRole("button", { name: "فتح القائمة" }).click();
  await page.getByRole("button", { name: "المنتجات", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "المنتجات", exact: true }),
  ).toBeVisible();
  await page.screenshot({ path: ".local/products-mobile.png", fullPage: true });
});
test("main cashier workflow against a real configured test Supabase", async ({
  page,
}) => {
  test.skip(
    !process.env.E2E_EMAIL ||
      !process.env.E2E_PASSWORD ||
      !process.env.E2E_BARCODE,
    "Requires real test Supabase, seed, open shift and E2E credentials.",
  );
  await page.goto("/");
  await page
    .getByRole("button", { name: "تسجيل الدخول", exact: true })
    .first()
    .click();
  await page.getByLabel("البريد الإلكتروني").fill(process.env.E2E_EMAIL!);
  await page.getByLabel("كلمة المرور").fill(process.env.E2E_PASSWORD!);
  await page
    .getByRole("button", { name: "تسجيل الدخول", exact: true })
    .last()
    .click();
  await expect(
    page.getByText("تم تسجيل الدخول", { exact: true }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "نقطة البيع", exact: false })
    .first()
    .click();
  const input = page.getByRole("textbox", { name: "باركود المنتج" });
  for (let i = 0; i < 2; i++) {
    await input.fill(process.env.E2E_BARCODE!);
    await input.press("Enter");
    await page.waitForTimeout(150);
  }
  await expect(page.locator(".quantity b").first()).toHaveText("2");
  await page.getByRole("button", { name: "إتمام الدفع" }).click();
  await page.getByLabel("المبلغ المستلم (₪)").fill("10000");
  await page.getByRole("button", { name: "تأكيد البيع", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "تم إصدار الإيصال" }),
  ).toBeVisible();
  await expect(page.locator("#receipt")).toContainText("najd POS");
});
