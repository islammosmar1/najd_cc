import { type NextRequest, NextResponse } from "next/server";
import { configured } from "@/lib/database";
import { neonAuth } from "@/lib/auth/server";
export const dynamic = "force-dynamic";
async function handle(
  request: NextRequest,
  context: { params: Promise<{ path: string[] }> },
) {
  if (!configured())
    return NextResponse.json(
      { error: "تسجيل الدخول غير مفعّل بعد" },
      { status: 503 },
    );
  const handlers = neonAuth().handler();
  if (request.method === "GET") return handlers.GET(request, context);
  return handlers.POST(request, context);
}
export { handle as GET, handle as POST };
