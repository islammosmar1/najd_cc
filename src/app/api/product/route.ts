import { NextRequest, NextResponse } from "next/server";
import { configured, currentUser, rpc } from "@/lib/database";
import { z } from "zod";
export async function GET(request: NextRequest) {
  if (!configured())
    return NextResponse.json(
      { error: "قاعدة البيانات غير متصلة" },
      { status: 503 },
    );
  try {
    const params = z
      .object({ b: z.uuid(), br: z.uuid(), v: z.uuid() })
      .parse(Object.fromEntries(request.nextUrl.searchParams));
    const user = await currentUser();
    if (!user)
      return NextResponse.json({ error: "يرجى تسجيل الدخول" }, { status: 401 });
    const data = await rpc(user.id, "product_detail", [
      params.b,
      params.br,
      params.v,
    ]);
    if (!data) throw Error();
    return NextResponse.json(data, {
      headers: { "Cache-Control": "private, no-store" },
    });
  } catch {
    return NextResponse.json(
      { error: "لا يمكن قراءة تفاصيل هذا المنتج" },
      { status: 403 },
    );
  }
}
