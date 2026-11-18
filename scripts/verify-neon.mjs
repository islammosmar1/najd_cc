import { Client } from "pg";
import { randomUUID } from "node:crypto";
import assert from "node:assert/strict";
const url = new URL(
  process.env.DATABASE_URL_UNPOOLED || process.env.DATABASE_URL,
);
url.searchParams.set("sslmode", "verify-full");
const db = new Client({ connectionString: url.toString() });
try {
  await db.connect();
  await db.query("begin");
  const company = (
    await db.query(
      "select business_id from private.company_setup where singleton",
    )
  ).rows[0].business_id;
  const branches = (
    await db.query(
      "select id,name from branches where business_id=$1 order by name",
      [company],
    )
  ).rows;
  assert.deepEqual(
    branches.map((b) => b.name).sort(),
    ["فرع الستي سنتر", "فرع شارع أبو بكر"].sort(),
  );
  const a = branches.find((b) => b.name === "فرع الستي سنتر").id,
    b = branches.find((b) => b.name === "فرع شارع أبو بكر").id,
    user = randomUUID();
  await db.query("insert into auth.users(id,email) values($1,$2)", [
    user,
    "database-verification@example.invalid",
  ]);
  await db.query(
    "insert into memberships(business_id,user_id,role,display_name) values($1,$2,'owner','اختبار معاملة يتم التراجع عنها')",
    [company, user],
  );
  await db.query("set local role authenticated");
  await db.query("select set_config('request.jwt.claim.sub',$1,true)", [user]);
  const p = {
    business_id: company,
    branch_id: a,
    key: randomUUID(),
    name: "منتج تحقق مؤقت",
    sku: "VERIFY-" + randomUUID(),
    barcode: "VERIFY-" + randomUUID(),
    price: 2500,
    cost: 1000,
    min_stock: 5,
    category: "",
    image_url: "",
    description: "",
    initial_stock: [
      { branch_id: a, quantity: 20 },
      { branch_id: b, quantity: 15 },
    ],
  };
  const product = (
    await db.query("select add_product($1::jsonb) as r", [JSON.stringify(p)])
  ).rows[0].r.id;
  const variant = (
    await db.query("select id from product_variants where product_id=$1", [
      product,
    ])
  ).rows[0].id;
  const order = {
    branch_id: a,
    key: randomUUID(),
    items: [{ variant_id: variant, qty: 2, discount: 0 }],
    discount: 0,
    cash: 5000,
  };
  const sale = (
    await db.query("select quick_checkout($1::jsonb) as r", [
      JSON.stringify(order),
    ])
  ).rows[0].r;
  assert.equal(
    (
      await db.query("select quick_checkout($1::jsonb) as r", [
        JSON.stringify(order),
      ])
    ).rows[0].r.id,
    sale.id,
  );
  const inventory = (
    await db.query(
      "select branch_id,quantity from branch_inventory where variant_id=$1",
      [variant],
    )
  ).rows;
  assert.equal(inventory.find((i) => i.branch_id === a).quantity, 18);
  assert.equal(inventory.find((i) => i.branch_id === b).quantity, 15);
  assert.equal(
    inventory.reduce((n, i) => n + i.quantity, 0),
    33,
  );
  const report = (
    await db.query(
      "select financials($1,$2,now()-interval '1 minute',now()+interval '1 minute') as r",
      [company, a],
    )
  ).rows[0].r;
  assert.equal(report.cogs, 2000);
  await db.query("rollback");
  console.log(
    "PASS live Neon: named branches, atomic product creation, 18 / 15 / 33 checkout, duplicate protection, historical cost. All verification records rolled back.",
  );
} catch (error) {
  try {
    await db.query("rollback");
  } catch {}
  console.error("Live verification failed:", error.code || "", error.message);
  process.exitCode = 1;
} finally {
  await db.end();
}
