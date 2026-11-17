import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { checkoutSchema, productSchema } from "@/lib/domain";
import { configured, db } from "@/lib/supabase/server";
const uuid = z.uuid();
const amount = z.number().int().min(0).max(10000000000);
const schemas = {
  product: productSchema.extend({
    product_id: uuid.optional(),
    variant_id: uuid.optional(),
  }),
  stock: z.object({
    variant_id: uuid,
    delta: z
      .number()
      .int()
      .min(-1000000)
      .max(1000000)
      .refine((x) => x !== 0),
    reason: z.string().trim().min(3).max(300),
  }),
  branch: z.object({
    name: z.string().trim().min(2).max(100),
    address: z.string().max(300),
  }),
  staff: z.object({
    user_id: uuid,
    role: z.enum([
      "super_admin",
      "owner",
      "manager",
      "cashier",
      "inventory",
      "accountant",
    ]),
    display_name: z.string().trim().min(2).max(100),
  }),
  settings: z.object({ tax_bps: z.number().int().min(0).max(10000) }),
  expense: z.object({
    title: z.string().trim().min(2).max(200),
    amount: amount.refine((x) => x > 0),
  }),
  shift_open: z.object({ opening: amount }),
  shift_close: z.object({ id: uuid, closing: amount }),
  transfer_create: z.object({
    destination_id: uuid,
    variant_id: uuid,
    qty: z.number().int().min(1).max(100000),
  }),
  transfer_ship: z.object({ id: uuid }),
  transfer_receive: z.object({ id: uuid }),
  transfer_cancel: z.object({ id: uuid }),
  return: z.object({ id: uuid, reason: z.string().trim().min(3).max(300) }),
  cancel_sale: z.object({
    id: uuid,
    reason: z.string().trim().min(3).max(300),
  }),
};
export async function POST(req: NextRequest) {
  // Next can normalize a loopback URL's hostname. Compare the browser origin
  // with the actual request Host, rather than that normalized URL.
  const origin = req.headers.get("origin");
  let sameOrigin = false;
  try {
    sameOrigin = Boolean(
      origin &&
      new URL(origin).host === req.headers.get("host") &&
      new URL(origin).protocol === req.nextUrl.protocol,
    );
  } catch {}
  if (!sameOrigin)
    return NextResponse.json(
      { error: "طلب غير مسموح", rolledBack: true },
      { status: 403 },
    );
  if (!configured())
    return NextResponse.json(
      { error: "أكمل إعداد Supabase أولاً", rolledBack: true },
      { status: 503 },
    );
  try {
    if (Number(req.headers.get("content-length") || 0) > 200000)
      throw Error("الطلب كبير جدًا");
    const body = await req.json();
    const client = await db();
    const {
      data: { user },
    } = await client.auth.getUser();
    if (!user)
      return NextResponse.json(
        { error: "يرجى تسجيل الدخول", rolledBack: true },
        { status: 401 },
      );
    let result;
    if (body.action === "checkout") {
      const p = checkoutSchema.parse(body.payload);
      result = await client.rpc("checkout", { p });
    } else {
      const action = z
        .enum(
          Object.keys(schemas) as [
            keyof typeof schemas,
            ...(keyof typeof schemas)[],
          ],
        )
        .parse(body.action);
      const common = z
        .object({ business_id: uuid, branch_id: uuid.nullable(), key: uuid })
        .parse(body.payload);
      const p = schemas[action].parse(body.payload);
      result = await client.rpc("command", { action, p: { ...p, ...common } });
    }
    if (result.error) {
      const msg = result.error.message;
      const readable = /[\u0600-\u06ff]/.test(msg)
        ? msg
        : result.error.code === "23505"
          ? "السجل أو الباركود أو SKU مستخدم بالفعل"
          : result.error.code === "23514"
            ? "القيمة المدخلة غير صالحة"
            : "تعذر حفظ العملية. تحقق من البيانات والصلاحيات ثم أعد المحاولة.";
      const rolledBack =
        /^[0-9A-Z]{5}$/.test(result.error.code) ||
        result.error.code.startsWith("PGRST");
      return NextResponse.json(
        { error: readable, rolledBack },
        { status: rolledBack ? 400 : 502 },
      );
    }
    return NextResponse.json(result.data);
  } catch {
    return NextResponse.json(
      { error: "بيانات غير صالحة. راجع الحقول المطلوبة.", rolledBack: true },
      { status: 400 },
    );
  }
}
