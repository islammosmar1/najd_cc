// Dedicated test projects only. Never run against a store's production database.
import { createClient } from "@supabase/supabase-js";
import { randomUUID } from "node:crypto";
const url = process.env.NEXT_PUBLIC_SUPABASE_URL,
  key = process.env.SUPABASE_SERVICE_ROLE_KEY,
  publishable = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
  password = process.env.DEMO_PASSWORD;
if (
  !url ||
  !key ||
  !publishable ||
  !password ||
  password.length < 12 ||
  process.env.SEED_DEMO_CONFIRM !== "DEDICATED_TEST_PROJECT"
)
  throw Error(
    "Set URL, publishable key, SUPABASE_SERVICE_ROLE_KEY, DEMO_PASSWORD (12+ chars), SEED_DEMO_CONFIRM=DEDICATED_TEST_PROJECT.",
  );
const admin = createClient(url, key, {
  auth: { persistSession: false, autoRefreshToken: false },
});
const client = createClient(url, publishable, {
  auth: { persistSession: false, autoRefreshToken: false },
});
async function check(result) {
  if (result.error) throw Error(result.error.message);
  return result.data;
}
const existing = await admin
  .from("businesses")
  .select("id")
  .eq("name", "SmartBranch Demo");
if (existing.error) throw existing.error;
if (existing.data.length)
  throw Error("Demo already exists. Refusing to duplicate seed.");
const people = [
  ["owner", "owner", null, "مدير المتجر"],
  ["cashier", "cashier", "a", "أحمد - كاشير"],
  ["inventory", "inventory", "b", "سارة - مخزون"],
  ["accountant", "accountant", null, "محمد - محاسب"],
];
const userIds = {};
for (const [name] of people) {
  const data = await check(
    await admin.auth.admin.createUser({
      email: `${name}@smartbranch.example`,
      password,
      email_confirm: true,
    }),
  );
  userIds[name] = data.user.id;
}
const business = randomUUID(),
  a = randomUUID(),
  b = randomUUID();
await check(
  await admin
    .from("businesses")
    .insert({ id: business, name: "SmartBranch Demo" }),
);
await check(
  await admin.from("branches").insert([
    {
      id: a,
      business_id: business,
      name: "الفرع أ - رام الله",
      address: "شارع الإرسال",
    },
    {
      id: b,
      business_id: business,
      name: "الفرع ب - الخليل",
      address: "وسط المدينة",
    },
  ]),
);
await check(
  await admin
    .from("memberships")
    .insert(
      people.map(([name, role, branch, display_name]) => ({
        business_id: business,
        user_id: userIds[name],
        branch_id: branch === "a" ? a : branch === "b" ? b : null,
        role,
        display_name,
      })),
    ),
);
await check(
  await client.auth.signInWithPassword({
    email: "owner@smartbranch.example",
    password,
  }),
);
async function command(action, p, br = a) {
  return check(
    await client.rpc("command", {
      action,
      p: { ...p, business_id: business, branch_id: br, key: randomUUID() },
    }),
  );
}
const samples = [
  [
    "كريم ترطيب يومي",
    "CREAM-01",
    "7290000000017",
    4500,
    2200,
    "العناية بالبشرة",
  ],
  [
    "غسول الوجه اللطيف",
    "FACE-01",
    "7290000000024",
    3500,
    1600,
    "العناية بالبشرة",
  ],
  ["عطر مسك أبيض", "PERFUME-01", "7290000000031", 12000, 6500, "العطور"],
  ["شامبو طبيعي", "HAIR-01", "7290000000048", 2800, 1300, "العناية بالشعر"],
  ["واقي شمس SPF50", "SUN-01", "7290000000055", 6500, 3000, "العناية بالبشرة"],
  ["أحمر شفاه وردي", "LIP-01", "7290000000062", 2500, 1100, "المكياج"],
];
let demoVariant;
for (const [name, sku, barcode, price, cost, category] of samples) {
  await command("product", {
    name,
    sku,
    barcode,
    price,
    cost,
    category,
    min_stock: 5,
    image_url: "",
    description: "",
  });
  const rows = await check(
    await client
      .from("product_variants")
      .select("id")
      .eq("business_id", business)
      .eq("sku", sku)
      .single(),
  );
  const variant = rows.id;
  await command(
    "stock",
    { variant_id: variant, delta: 20, reason: "مخزون افتتاحي تجريبي" },
    a,
  );
  await command(
    "stock",
    { variant_id: variant, delta: 15, reason: "مخزون افتتاحي تجريبي" },
    b,
  );
  demoVariant ??= variant;
}
const shift = await command("shift_open", { opening: 10000 });
await check(
  await client.rpc("checkout", {
    p: {
      branch_id: a,
      shift_id: shift.id,
      key: randomUUID(),
      items: [{ variant_id: demoVariant, qty: 2, discount: 0 }],
      discount: 0,
      cash: 10000,
    },
  }),
);
await command("expense", { title: "مستلزمات تغليف", amount: 1500 });
console.log(
  "Demo created. Owner: owner@smartbranch.example. Password is the DEMO_PASSWORD you supplied (not printed).",
);
console.log(
  "First product: Branch A=18, Branch B=15, total=33. Other products: 20 / 15.",
);
await client.auth.signOut();
