import { NextRequest, NextResponse } from "next/server";
import { emptyData } from "@/lib/types";
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
    const metricsBranch = request.nextUrl.searchParams.get("metrics_branch") || null;
    if (metricsBranch) z.uuid().parse(metricsBranch);
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
          const { rows } = table === "sales"
            ? await client.query("select * from public.sales where ($1::uuid is null or business_id=$1) and ($2::uuid is null or branch_id=$2) and created_at>=$3 and created_at<$4 order by created_at desc,id", [b || (entries.businesses as {id:string}[])[0]?.id || null,br,from,to])
            : table === "sale_items"
              ? await client.query("select * from public.sale_items where sale_id=any($1::uuid[]) order by id", [(entries.sales as {id:string}[]).map(sale=>sale.id)])
              : await client.query(`select * from public.${table} order by ${order}`);
          entries[table] = rows;
        }
        const pool = await client.query("select business_id,branch_id from inventory_pools order by business_id");
        const inventoryBranch = pool.rows.find(row => !b || row.business_id === b)?.branch_id;
        const businessId = b || (entries.businesses as {id:string}[])[0]?.id;
        const salesBranch = metricsBranch || (entries.branches as {id:string}[]).find(branch => branch.id !== inventoryBranch)?.id;
        let dailySummary = undefined;
        if (businessId && salesBranch) {
          const result = await client.query("select public.daily_summary($1,$2,date_trunc('day',now() at time zone 'Asia/Hebron') at time zone 'Asia/Hebron',(date_trunc('day',now() at time zone 'Asia/Hebron')+interval '1 day') at time zone 'Asia/Hebron') as summary", [businessId,salesBranch]);
          dailySummary = {...result.rows[0].summary,branch_id:salesBranch};
        }
        return { ...entries, inventory_branch_id: inventoryBranch, daily_summary: dailySummary, financial: null };
      },
      true,
    );
    return NextResponse.json(
      { ...emptyData, ...data, user_id: user.id, user_email: user.email, email_verified: user.emailVerified },
      { headers: { "Cache-Control": "private, no-store" } },
    );
  } catch {
    return NextResponse.json(
      { error: "تعذر تحميل البيانات. تحقق من الاتصال وأعد المحاولة." },
      { status: 500 },
    );
  }
}
