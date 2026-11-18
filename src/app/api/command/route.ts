import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { checkoutSchema, productSchema } from "@/lib/domain";
import { configured, currentUser, rpc } from "@/lib/database";
const uuid = z.uuid();
const amount = z.number().int().min(0).max(10000000000);
const schemas = {
  product: productSchema.extend({
    product_id: uuid.optional(),
    variant_id: uuid.optional(),
    initial_stock: z
      .array(
        z.object({
          branch_id: uuid,
          quantity: z.number().int().min(0).max(1000000),
        }),
      )
      .max(100)
      .optional(),
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
  stock_set: z.object({
    variant_id: uuid,
    quantity: z.number().int().min(0).max(1000000),
    expected_qty: z.number().int().min(0),
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
      { error: "تفعيل قاعدة البيانات مطلوب أولًا", rolledBack: true },
      { status: 503 },
    );
  let submitted = false;
  try {
    if (Number(req.headers.get("content-length") || 0) > 200000)
      throw Error("الطلب كبير جدًا");
    const body = await req.json();
    const user = await currentUser();
    if (!user)
      return NextResponse.json(
        { error: "يرجى تسجيل الدخول", rolledBack: true },
        { status: 401 },
      );
    let result: unknown;
    if (body.action === "checkout") {
      const p = checkoutSchema.parse(body.payload);
      submitted = true;
      result = await rpc(user.id, p.shift_id ? "checkout" : "quick_checkout", [
        p,
      ]);
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
      const payload = { ...p, ...common };
      submitted = true;
      result =
        action === "stock_set"
          ? await rpc(user.id, "set_stock", [payload])
          : action === "product" && "initial_stock" in p && p.initial_stock
            ? await rpc(user.id, "add_product", [payload])
            : await rpc(user.id, "command", [action, payload]);
    }
    return NextResponse.json(result);
  } catch (error) {
    const fault = error as { code?: string; message?: string };
    const rolledBack =
      !submitted ||
      Boolean(
        fault.code &&
        /^[0-9A-Z]{5}$/.test(fault.code) &&
        !/^(08|57)/.test(fault.code),
      );
    const message = /[\u0600-\u06ff]/.test(fault.message || "")
      ? fault.message
      : fault.code === "23505"
        ? "الباركود أو رمز المنتج مستخدم بالفعل"
        : error instanceof z.ZodError
          ? "راجع البيانات والحقول المطلوبة"
          : "تعذر حفظ العملية. تحقق من الاتصال ثم أعد المحاولة بنفس الطلب.";
    return NextResponse.json(
      { error: message, rolledBack },
      { status: rolledBack ? 400 : 502 },
    );
  }
}
