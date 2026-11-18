import { NextRequest, NextResponse } from "next/server";
import { configured, currentUser, asUser } from "@/lib/database";
import { z } from "zod";
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
export async function GET(request: NextRequest) {
  if (!configured())
    return NextResponse.json(
      { error: "تفعيل قاعدة البيانات مطلوب أولًا" },
      { status: 503 },
    );
  try {
    const user = await currentUser();
    if (!user)
      return NextResponse.json({ error: "يرجى تسجيل الدخول" }, { status: 401 });
    const b = request.nextUrl.searchParams.get("business") || null;
    const br = request.nextUrl.searchParams.get("branch") || null;
    if (b) z.uuid().parse(b);
    if (br) z.uuid().parse(br);
    const from =
      request.nextUrl.searchParams.get("from") ||
      new Date(new Date().setUTCHours(0, 0, 0, 0)).toISOString();
    const to =
      request.nextUrl.searchParams.get("to") || new Date().toISOString();
    z.iso.datetime({ offset: true }).parse(from);
    z.iso.datetime({ offset: true }).parse(to);
    const data = await asUser(
      user.id,
      async (client) => {
        const entries: Record<string, unknown> = {};
        for (const table of tables) {
          const order =
            table === "branch_inventory" || table === "branch_prices"
              ? "branch_id,variant_id"
              : "id";
          const { rows } = await client.query(
            `select * from public.${table} order by ${order}`,
          );
          entries[table] = rows;
        }
        let financial = null;
        if (b) {
          const { rows } = await client.query(
            `select private.allowed($1,$2,array['super_admin','owner','manager','accountant']::public.staff_role[]) as permitted`,
            [b, br],
          );
          if (rows[0].permitted)
            financial = (
              await client.query(
                "select public.financials($1,$2,$3,$4) as result",
                [b, br, from, to],
              )
            ).rows[0].result;
        }
        return { ...entries, financial };
      },
      true,
    );
    return NextResponse.json(
      { ...data, user_id: user.id, email_verified: user.emailVerified },
      { headers: { "Cache-Control": "private, no-store" } },
    );
  } catch {
    return NextResponse.json(
      { error: "تعذر تحميل البيانات. تحقق من الاتصال وأعد المحاولة." },
      { status: 500 },
    );
  }
}
