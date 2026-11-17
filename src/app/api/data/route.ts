import { NextRequest, NextResponse } from "next/server";
import { configured, db } from "@/lib/supabase/server";
export async function GET(req: NextRequest) {
  if (!configured())
    return NextResponse.json(
      { error: "أكمل إعداد الاتصال أولاً" },
      { status: 503 },
    );
  const client = await db();
  const {
    data: { user },
  } = await client.auth.getUser();
  if (!user)
    return NextResponse.json({ error: "يرجى تسجيل الدخول" }, { status: 401 });
  const tables = [
    "businesses",
    "branches",
    "memberships",
    "products",
    "product_variants",
    "product_barcodes",
    "branch_inventory",
    "branch_prices",
    "sales",
    "sale_items",
    "payments",
    "stock_transfers",
    "transfer_items",
    "expenses",
    "cash_shifts",
    "inventory_movements",
    "suppliers",
    "purchases",
    "audit_logs",
  ] as const;
  // Read every page: Supabase's default 1,000-row cap must not silently
  // understate stock or revenue. RLS remains enforced on every request.
  const results = await Promise.all(
    tables.map(async (t) => {
      const data: Record<string, unknown>[] = [];
      for (let start = 0; ; start += 500) {
        let query = client.from(t).select("*");
        query =
          t === "branch_inventory" || t === "branch_prices"
            ? query.order("branch_id").order("variant_id")
            : query.order("id");
        const result = await query.range(start, start + 499);
        if (result.error) return { data, error: result.error };
        data.push(...(result.data ?? []));
        if ((result.data?.length ?? 0) < 500) return { data, error: null };
      }
    }),
  );
  const failure = results.find((r) => r.error);
  if (failure)
    return NextResponse.json(
      {
        error:
          "تعذر تحميل البيانات. تحقق من تطبيق migrations وصلاحيات الاتصال.",
      },
      { status: 500 },
    );
  const data = Object.fromEntries(tables.map((t, i) => [t, results[i].data]));
  const b = req.nextUrl.searchParams.get("business");
  let financial = null;
  if (b) {
    const result = await client.rpc("financials", {
      b,
      br: req.nextUrl.searchParams.get("branch") || null,
      from_date:
        req.nextUrl.searchParams.get("from") ||
        new Date(new Date().setHours(0, 0, 0, 0)).toISOString(),
      to_date: req.nextUrl.searchParams.get("to") || new Date().toISOString(),
    });
    financial = result.data;
  }
  return NextResponse.json(
    { ...data, financial, user_id: user.id },
    { headers: { "Cache-Control": "private, no-store" } },
  );
}
