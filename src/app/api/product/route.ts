import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { configured, db } from "@/lib/supabase/server";
export async function GET(req: NextRequest) {
  if (!configured())
    return NextResponse.json({ error: "أكمل إعداد الاتصال" }, { status: 503 });
  const params = z
    .object({ b: z.uuid(), br: z.uuid(), v: z.uuid() })
    .safeParse(Object.fromEntries(req.nextUrl.searchParams));
  if (!params.success)
    return NextResponse.json({ error: "طلب غير صالح" }, { status: 400 });
  const client = await db();
  const {
    data: { user },
  } = await client.auth.getUser();
  if (!user)
    return NextResponse.json({ error: "يرجى تسجيل الدخول" }, { status: 401 });
  const { data, error } = await client.rpc("product_detail", params.data);
  if (error || !data)
    return NextResponse.json(
      { error: "لا يمكن قراءة تفاصيل المنتج" },
      { status: 403 },
    );
  return NextResponse.json(data, {
    headers: { "Cache-Control": "private, no-store" },
  });
}
