// Optional demo for a dedicated disposable Neon test database only.
// First sign into its app so the specified verified identity is synchronized.
import { Client } from "pg";
import { randomUUID } from "node:crypto";
if (
  process.env.SEED_DEMO_CONFIRM !== "DISPOSABLE_NEON_TEST_DATABASE" ||
  !process.env.DEMO_EMAIL
)
  throw Error(
    "Use a separate disposable Neon database, then set DEMO_EMAIL and SEED_DEMO_CONFIRM=DISPOSABLE_NEON_TEST_DATABASE. Never seed production.",
  );
const url = new URL(
  process.env.DATABASE_URL_UNPOOLED || process.env.DATABASE_URL,
);
if (url.hostname.endsWith(".neon.tech"))
  url.searchParams.set("sslmode", "verify-full");
const client = new Client({ connectionString: url.toString() });
try {
  await client.connect();
  await client.query("begin");
  const user = (
    await client.query(
      "select id from auth.users where lower(email)=lower($1) and provider_id is not null",
      [process.env.DEMO_EMAIL],
    )
  ).rows[0];
  if (!user)
    throw Error("Sign into the separate test app with DEMO_EMAIL first.");
  if (
    (await client.query("select 1 from businesses where name='najd DEMO'")).rows
      .length
  )
    throw Error("Demo already exists.");
  const business = randomUUID(),
    a = randomUUID(),
    b = randomUUID();
  await client.query("insert into businesses(id,name) values($1,'najd DEMO')", [
    business,
  ]);
  await client.query(
    "insert into branches(id,business_id,name) values($1,$3,'فرع الستي سنتر - تجريبي'),($2,$3,'فرع شارع أبو بكر - تجريبي')",
    [a, b, business],
  );
  await client.query(
    "insert into memberships(business_id,user_id,role,display_name) values($1,$2,'owner','حساب تجريبي')",
    [business, user.id],
  );
  await client.query("set local role authenticated");
  await client.query("select set_config('request.jwt.claim.sub',$1,true)", [
    user.id,
  ]);
  let first;
  for (const [name, sku, price, cost] of [
    ["كريم مرطب", "DEMO-CREAM", 2500, 1000],
    ["عطر", "DEMO-PERFUME", 7500, 3500],
    ["شامبو", "DEMO-HAIR", 3000, 1500],
  ]) {
    const p = {
      business_id: business,
      branch_id: a,
      key: randomUUID(),
      name,
      sku,
      barcode: "NJ-" + sku,
      price,
      cost,
      min_stock: 5,
      category: "",
      image_url: "",
      description: "بيانات تجريبية",
      initial_stock: [
        { branch_id: a, quantity: 20 },
        { branch_id: b, quantity: 15 },
      ],
    };
    const product = (
      await client.query("select add_product($1::jsonb) as r", [
        JSON.stringify(p),
      ])
    ).rows[0].r.id;
    first ??= (
      await client.query(
        "select id from product_variants where product_id=$1",
        [product],
      )
    ).rows[0].id;
  }
  await client.query("select quick_checkout($1::jsonb)", [
    JSON.stringify({
      branch_id: a,
      key: randomUUID(),
      items: [{ variant_id: first, qty: 2, discount: 0 }],
      discount: 0,
      cash: 5000,
    }),
  ]);
  await client.query("commit");
  console.log(
    "Disposable test demo created. First product: City Center 18, Abu Bakr 15, total 33. No authentication password was created or changed.",
  );
} catch (error) {
  try {
    await client.query("rollback");
  } catch {}
  console.error(error.message);
  process.exitCode = 1;
} finally {
  await client.end();
}
