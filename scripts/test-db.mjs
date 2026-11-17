import { PGlite } from "@electric-sql/pglite";
import fs from "node:fs/promises";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import path from "node:path";
let cluster;
let native;
if (process.argv.includes("--native")) {
  const { default: EmbeddedPostgres } = await import("embedded-postgres");
  cluster = new EmbeddedPostgres({
    databaseDir: path.join(process.cwd(), ".local", "postgres-" + randomUUID()),
    user: "postgres",
    password: randomUUID(),
    port: 55439,
    persistent: true,
    postgresFlags: ["-h", "127.0.0.1"],
    onLog: () => {},
    onError: (message) => console.error(String(message).trim()),
  });
  await cluster.initialise();
  await cluster.start();
  native = cluster.getPgClient();
  await native.connect();
}
const db = native
  ? {
      query: (...args) => native.query(...args),
      exec: (sql) => native.query(sql),
      close: async () => {
        await native.end();
        // The library can miss the exit event on Windows after taskkill has
        // already removed the process. Bound that wait and verify the PID.
        const child=cluster.process;
        let timer;
        try{
          await Promise.race([cluster.stop(),new Promise(resolve=>{timer=setTimeout(resolve,5000);})]);
          if(child?.pid){try{process.kill(child.pid,0);throw Error('Temporary PostgreSQL server did not stop');}catch(e){if(e.code!=='ESRCH')throw e;}}
          cluster.process=undefined;
          child?.stdin?.destroy();child?.stdout?.destroy();child?.stderr?.destroy();
        }finally{clearTimeout(timer);}
      },
    }
  : new PGlite();
try {
  let passed = 0;
  async function test(name, fn) {
    try {
      await fn();
      passed++;
      console.log("PASS", name);
    } catch (e) {
      console.error("FAIL", name);
      throw e;
    }
  }
  const owner = randomUUID(),
    cashier = randomUUID(),
    stranger = randomUUID(),
    business = randomUUID(),
    a = randomUUID(),
    b = randomUUID();
  await db.exec(
    `create role anon;create role authenticated;create schema auth;create table auth.users(id uuid primary key,email text);create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;grant usage on schema auth to authenticated;grant execute on function auth.uid() to authenticated;`,
  );
  await db.exec(
    await fs.readFile(
      new URL("../supabase/schema.sql", import.meta.url),
      "utf8",
    ),
  );
  await db.query("insert into auth.users values ($1,$2),($3,$4),($5,$6)", [
    owner,
    "owner@example.test",
    cashier,
    "cashier@example.test",
    stranger,
    "other@example.test",
  ]);
  await db.query("insert into businesses(id,name) values($1,$2)", [
    business,
    "متجر التجربة",
  ]);
  await db.query(
    "insert into branches(id,business_id,name) values($1,$3,$4),($2,$3,$5)",
    [a, b, business, "الفرع أ", "الفرع ب"],
  );
  await db.query(
    "insert into memberships(business_id,user_id,branch_id,role,display_name) values($1,$2,null,'owner','مالك'),($1,$3,$4,'cashier','كاشير')",
    [business, owner, cashier, a],
  );
  async function user(id) {
    await db.query("select set_config('request.jwt.claim.sub',$1,false)", [id]);
  }
  await user(owner);
  async function command(action, p, key = randomUUID()) {
    return (
      await db.query("select public.command($1,$2::jsonb) as result", [
        action,
        JSON.stringify({ business_id: business, branch_id: a, key, ...p }),
      ])
    ).rows[0].result;
  }
  const product = {
    name: "كريم مرطب",
    sku: "CREAM-01",
    barcode: "SB001",
    price: 2500,
    cost: 1000,
    min_stock: 5,
    category: "عناية",
    image_url: "",
    description: "",
  };
  let variant, shift, sale;
  await test("create product + unique barcode", async () => {
    await command("product", product);
    variant = (await db.query("select id from product_variants")).rows[0].id;
    await assert.rejects(() => command("product", product));
    assert.equal(
      (await db.query("select count(*)::int as n from products")).rows[0].n,
      1,
    );
  });
  await test("receive independent branch stock 20 / 15", async () => {
    await command("stock", {
      variant_id: variant,
      delta: 20,
      reason: "استلام افتتاحي",
    });
    await command("stock", {
      branch_id: b,
      variant_id: variant,
      delta: 15,
      reason: "استلام افتتاحي",
    });
  });
  await test("stock writes are retry safe", async () => {
    const key = randomUUID();
    const p = { variant_id: variant, delta: 1, reason: "تجربة تكرار" };
    await command("stock", p, key);
    await command("stock", p, key);
    assert.equal(
      (
        await db.query(
          "select quantity from branch_inventory where branch_id=$1",
          [a],
        )
      ).rows[0].quantity,
      21,
    );
    await command("stock", {
      variant_id: variant,
      delta: -1,
      reason: "إعادة الجرد",
    });
  });
  await test("cashier cannot adjust stock or read costs", async () => {
    await user(cashier);
    await assert.rejects(() =>
      command("stock", { variant_id: variant, delta: 1, reason: "غير مصرح" }),
    );
    await db.exec("set role authenticated");
    await assert.rejects(() => db.query("select * from private.costs"));
    await db.exec("reset role");
  });
  await test("cashier branch RLS + no direct write", async () => {
    await db.exec("set role authenticated");
    const rows = (await db.query("select * from branch_inventory")).rows;
    assert.equal(rows.length, 1);
    assert.equal(rows[0].branch_id, a);
    await assert.rejects(() =>
      db.query("update branch_inventory set quantity=100"),
    );
    await db.exec("reset role");
  });
  await test("cashier cannot read financial report", async () => {
    await assert.rejects(() =>
      db.query(
        "select financials($1,$2,now()-interval '1 day',now()+interval '1 day')",
        [business, a],
      ),
    );
  });
  await test('product cost detail endpoint enforces role',async()=>{
    await assert.rejects(()=>db.query('select product_detail($1,$2,$3)',[business,a,variant]));
    await user(owner);const detail=(await db.query('select product_detail($1,$2,$3) as r',[business,a,variant])).rows[0].r;assert.equal(detail.cost,1000);await user(cashier);
  });
  await test("open cashier shift", async () => {
    shift = (await command("shift_open", { opening: 10000 })).id;
  });
  let payload;
  async function checkout(p) {
    return (
      await db.query("select checkout($1::jsonb) as result", [
        JSON.stringify(p),
      ])
    ).rows[0].result;
  }
  await test("atomic checkout: Branch A 18, B 15, total 33", async () => {
    payload = {
      branch_id: a,
      shift_id: shift,
      key: randomUUID(),
      items: [{ variant_id: variant, qty: 2, discount: 0 }],
      discount: 0,
      cash: 5000,
    };
    sale = await checkout(payload);
    assert.equal(Number(sale.total), 5000);
    const rows = (
      await db.query("select branch_id,quantity from branch_inventory")
    ).rows;
    assert.equal(rows.find((x) => x.branch_id === a).quantity, 18);
    assert.equal(rows.find((x) => x.branch_id === b).quantity, 15);
    assert.equal(
      rows.reduce((sum, x) => sum + x.quantity, 0),
      33,
    );
  });
  await test("duplicate checkout is exactly once", async () => {
    assert.equal((await checkout(payload)).id, sale.id);
    assert.equal(
      (await db.query("select count(*)::int as n from sales")).rows[0].n,
      1,
    );
  });
  await test("reject idempotency key reused with different body", async () => {
    await assert.rejects(() => checkout({ ...payload, cash: 6000 }));
  });
  await test("insufficient stock rolls entire transaction back", async () => {
    await assert.rejects(() =>
      checkout({
        ...payload,
        key: randomUUID(),
        items: [{ variant_id: variant, qty: 100, discount: 0 }],
        cash: 1000000,
      }),
    );
    assert.equal(
      (
        await db.query(
          "select quantity from branch_inventory where branch_id=$1",
          [a],
        )
      ).rows[0].quantity,
      18,
    );
    assert.equal(
      (await db.query("select count(*)::int as n from sales")).rows[0].n,
      1,
    );
  });
  await test("insufficient cash and duplicate variant lines rejected", async () => {
    await assert.rejects(() =>
      checkout({ ...payload, key: randomUUID(), cash: 0 }),
    );
    await assert.rejects(() =>
      checkout({
        ...payload,
        key: randomUUID(),
        items: [...payload.items, ...payload.items],
      }),
    );
  });
  await test("cross branch cashier checkout rejected", async () => {
    await assert.rejects(() =>
      checkout({ ...payload, branch_id: b, key: randomUUID() }),
    );
  });
  await test("historical COGS + correct profit", async () => {
    await user(owner);
    const report = (
      await db.query(
        "select financials($1,$2,now()-interval '1 day',now()+interval '1 day') as f",
        [business, a],
      )
    ).rows[0].f;
    assert.equal(report.revenue, 5000);
    assert.equal(report.cogs, 2000);
    assert.equal(report.net, 3000);
  });
  await test('price and cost edits preserve historical sale values and receipt',async()=>{
    await command('product',{...product,product_id:(await db.query('select product_id from product_variants where id=$1',[variant])).rows[0].product_id,variant_id:variant,cost:1900});
    const report=(await db.query("select financials($1,$2,now()-interval '1 day',now()+interval '1 day') as f",[business,a])).rows[0].f;assert.equal(report.cogs,2000);
    await user(cashier);const receipt=await checkout(payload);assert.equal(receipt.items[0].price,2500);assert.equal(receipt.items[0].name,product.name);await user(owner);
  });
  await test("return restores stock exactly once", async () => {
    await command("return", { id: sale.id, reason: "طلب العميل" });
    await command("return", { id: sale.id, reason: "طلب العميل" });
    assert.equal(
      (
        await db.query(
          "select quantity from branch_inventory where branch_id=$1",
          [a],
        )
      ).rows[0].quantity,
      20,
    );
    assert.equal(
      (await db.query("select count(*)::int as n from returns")).rows[0].n,
      1,
    );
  });
  let transfer;
  await test("pending transfer does not deduct, shipment does", async () => {
    transfer = (
      await command("transfer_create", {
        destination_id: b,
        variant_id: variant,
        qty: 5,
      })
    ).id;
    assert.equal(
      (
        await db.query(
          "select quantity from branch_inventory where branch_id=$1",
          [a],
        )
      ).rows[0].quantity,
      20,
    );
    await command("transfer_ship", { id: transfer });
    assert.equal(
      (
        await db.query(
          "select quantity from branch_inventory where branch_id=$1",
          [a],
        )
      ).rows[0].quantity,
      15,
    );
    await assert.rejects(() => command("transfer_ship", { id: transfer }));
  });
  await test("destination receipt idempotent, source cannot receive", async () => {
    await assert.rejects(() => command("transfer_receive", { id: transfer }));
    await command("transfer_receive", { branch_id: b, id: transfer });
    await command("transfer_receive", { branch_id: b, id: transfer });
    assert.equal(
      (
        await db.query(
          "select quantity from branch_inventory where branch_id=$1",
          [b],
        )
      ).rows[0].quantity,
      20,
    );
  });
  await test("pending transfer cancellation does not change stock", async () => {
    const id = (
      await command("transfer_create", {
        destination_id: b,
        variant_id: variant,
        qty: 2,
      })
    ).id;
    await command("transfer_cancel", { id });
    await assert.rejects(() => command("transfer_ship", { id }));
  });
  await test("negative inventory impossible", async () => {
    await assert.rejects(() =>
      command("stock", {
        variant_id: variant,
        delta: -100,
        reason: "جرد غير صحيح",
      }),
    );
  });
  await test("cancel sale restores inventory and prevents repeat refunds", async () => {
    await user(cashier);
    const s = await checkout({
      ...payload,
      key: randomUUID(),
      items: [{ variant_id: variant, qty: 1, discount: 0 }],
      cash: 2500,
    });
    await assert.rejects(() =>
      command("cancel_sale", { id: s.id, reason: "إلغاء تجربة" }),
    );
    await user(owner);
    await command("cancel_sale", { id: s.id, reason: "إلغاء تجربة" });
    await command("cancel_sale", { id: s.id, reason: "إلغاء تجربة" });
    assert.equal(
      (
        await db.query(
          "select quantity from branch_inventory where branch_id=$1",
          [a],
        )
      ).rows[0].quantity,
      15,
    );
  });
  await test("close shift reconciles actual cash operator refunds", async () => {
    await user(cashier);
    await command("shift_close", { id: shift, closing: 17500 });
    assert.ok(
      (await db.query("select closed_at from cash_shifts where id=$1", [shift]))
        .rows[0].closed_at,
    );
    await assert.rejects(() => checkout({ ...payload, key: randomUUID() }));
  });
  await test("unrelated user sees no tenant records", async () => {
    await user(stranger);
    await db.exec("set role authenticated");
    assert.equal((await db.query("select * from businesses")).rows.length, 0);
    assert.equal(
      (await db.query("select * from branch_inventory")).rows.length,
      0,
    );
    await db.exec("reset role");
  });
  if (cluster) {
    const c1 = cluster.getPgClient(),
      c2 = cluster.getPgClient();
    await c1.connect();
    await c2.connect();
    try {
      await test("two simultaneous terminals cannot oversell the last unit", async () => {
        await user(owner);
        const current = (
          await db.query(
            "select quantity from branch_inventory where branch_id=$1",
            [a],
          )
        ).rows[0].quantity;
        await command("stock", {
          variant_id: variant,
          delta: 1 - current,
          reason: "تجربة آخر وحدة",
        });
        const s1 = await command("shift_open", { opening: 0 });
        await user(cashier);
        const s2 = await command("shift_open", { opening: 0 });
        await c1.query("select set_config('request.jwt.claim.sub',$1,false)", [
          owner,
        ]);
        await c2.query("select set_config('request.jwt.claim.sub',$1,false)", [
          cashier,
        ]);
        const p1 = {
          branch_id: a,
          shift_id: s1.id,
          key: randomUUID(),
          items: [{ variant_id: variant, qty: 1, discount: 0 }],
          discount: 0,
          cash: 2500,
        };
        const p2 = { ...p1, shift_id: s2.id, key: randomUUID() };
        const results = await Promise.allSettled([
          c1.query("select checkout($1::jsonb)", [JSON.stringify(p1)]),
          c2.query("select checkout($1::jsonb)", [JSON.stringify(p2)]),
        ]);
        assert.equal(results.filter((r) => r.status === "fulfilled").length, 1);
        assert.equal(results.filter((r) => r.status === "rejected").length, 1);
        assert.equal(
          (
            await db.query(
              "select quantity from branch_inventory where branch_id=$1",
              [a],
            )
          ).rows[0].quantity,
          0,
        );
      });
      await test("simultaneous same-key submissions produce one sale and deduction", async () => {
        await user(owner);
        await command("stock", {
          variant_id: variant,
          delta: 1,
          reason: "تجربة منع التكرار",
        });
        const sh = (
          await db.query(
            "select id from cash_shifts where user_id=$1 and closed_at is null",
            [owner],
          )
        ).rows[0].id;
        await c2.query("select set_config('request.jwt.claim.sub',$1,false)", [
          owner,
        ]);
        const p = {
          branch_id: a,
          shift_id: sh,
          key: randomUUID(),
          items: [{ variant_id: variant, qty: 1, discount: 0 }],
          discount: 0,
          cash: 2500,
        };
        const results = await Promise.all([
          c1.query("select checkout($1::jsonb) as r", [JSON.stringify(p)]),
          c2.query("select checkout($1::jsonb) as r", [JSON.stringify(p)]),
        ]);
        assert.equal(results[0].rows[0].r.id, results[1].rows[0].r.id);
        assert.equal(
          (
            await db.query(
              "select quantity from branch_inventory where branch_id=$1",
              [a],
            )
          ).rows[0].quantity,
          0,
        );
      });
    } finally {
      await c1.end();
      await c2.end();
    }
  }
  console.log(
    `\n${passed} PostgreSQL integration checks passed (${cluster ? "native multi-connection PostgreSQL" : "PGlite; no real concurrency test"}).`,
  );
} finally {
  await db.close();
}
