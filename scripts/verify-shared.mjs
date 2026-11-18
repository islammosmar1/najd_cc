import { Client } from "pg";
import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import assert from "node:assert/strict";
const url = new URL(process.env.DATABASE_URL_UNPOOLED || process.env.DATABASE_URL);
url.searchParams.set("sslmode", "verify-full");
const db = new Client({connectionString:url.toString()});
try {
 await db.connect(); await db.query("begin");
 const business = (await db.query("select business_id from private.company_setup where singleton")).rows[0].business_id;
 const user = randomUUID();
 await db.query("insert into auth.users(id,email) values($1,'shared-check@example.invalid')",[user]);
 await db.query("insert into memberships(business_id,user_id,role,display_name) values($1,$2,'owner','Rollback verification')",[business,user]);
 const exists = (await db.query("select to_regclass('public.inventory_pools') as t")).rows[0].t;
 const oldBranch = (await db.query("select id from branches where business_id=$1 and name='فرع الستي سنتر'",[business])).rows[0].id;
 const other = (await db.query("select id from branches where business_id=$1 and name='فرع شارع أبو بكر'",[business])).rows[0].id;
 await db.query("select set_config('request.jwt.claim.sub',$1,true)",[user]);
 const sku = "CHECK-"+randomUUID();
 const payload = {business_id:business,branch_id:oldBranch,key:randomUUID(),name:"شنطة اختبار مؤقتة",sku,barcode:"AUTO-"+sku,price:2500,cost:1000,min_stock:5,description:"",category:"",image_url:"",initial_stock:[{branch_id:oldBranch,quantity:20},{branch_id:other,quantity:15}]};
 const product = (await db.query("select add_product($1::jsonb) as r",[JSON.stringify(payload)])).rows[0].r.id;
 const variant = (await db.query("select id from product_variants where product_id=$1",[product])).rows[0].id;
 let legacy;
 if (!exists) {
   const order = {branch_id:oldBranch,key:randomUUID(),items:[{variant_id:variant,qty:2,discount:0}],discount:0,cash:5000};
   legacy = (await db.query("select quick_checkout($1::jsonb) as r",[JSON.stringify(order)])).rows[0].r.id;
   const before = (await db.query("select variant_id,sum(quantity)::text as total from branch_inventory where business_id=$1 group by variant_id order by variant_id",[business])).rows;
   await db.query(await readFile(new URL("../database/migrations/004_shared_inventory.sql",import.meta.url),"utf8"));
   assert.deepEqual((await db.query("select variant_id,sum(quantity)::text as total from branch_inventory where business_id=$1 group by variant_id order by variant_id",[business])).rows,before);
 }
 const pool = (await db.query("select branch_id from inventory_pools where business_id=$1",[business])).rows[0].branch_id;
 const qty = async()=>Number((await db.query("select quantity from branch_inventory where branch_id=$1 and variant_id=$2",[pool,variant])).rows[0].quantity);
 assert.equal(await qty(),legacy?33:35);
 if (legacy) {
   await db.query("select command('return',$1::jsonb)",[JSON.stringify({business_id:business,branch_id:oldBranch,key:randomUUID(),id:legacy,reason:"تحقق إرجاع فاتورة قديمة"})]);
   assert.equal(await qty(),35);
 }
 await db.query("set local role authenticated");
 const order = {branch_id:pool,key:randomUUID(),items:[{variant_id:variant,qty:2,discount:0}],discount:0,cash:5000};
 const first = (await db.query("select quick_checkout($1::jsonb) as r",[JSON.stringify(order)])).rows[0].r;
 assert.equal(await qty(),33);
 assert.equal((await db.query("select quick_checkout($1::jsonb) as r",[JSON.stringify(order)])).rows[0].r.id,first.id);
 assert.equal(await qty(),33);
 const count = {business_id:business,branch_id:pool,variant_id:variant,key:randomUUID(),expected_qty:33,quantity:10,reason:"تعديل الكمية الإجمالية"};
 await db.query("select set_stock($1::jsonb)",[JSON.stringify(count)]);
 assert.equal(await qty(),10);
 await db.query("select set_stock($1::jsonb)",[JSON.stringify(count)]);
 assert.equal(await qty(),10);
 await db.query("savepoint stale");
 await assert.rejects(db.query("select set_stock($1::jsonb)",[JSON.stringify({...count,key:randomUUID(),expected_qty:33})]),/تغير المخزون/);
 await db.query("rollback to savepoint stale");
 await db.query("savepoint oversell");
 await assert.rejects(db.query("select quick_checkout($1::jsonb)",[JSON.stringify({...order,key:randomUUID(),items:[{variant_id:variant,qty:11,discount:0}],cash:27500})]),/الكمية المتوفرة/);
 await db.query("rollback to savepoint oversell");
 assert.equal(await qty(),10);
 await db.query("rollback");
 console.log("PASS shared Neon: 20+15=35; legacy return targets pool; sale ->33; exactly-once retry; set total ->10; stale count and overselling rejected. All fixtures and preview migration rolled back.");
} catch(error) {
 try { await db.query("rollback"); } catch {}
 console.error("Shared verification failed:",error.code||"",error.message);process.exitCode=1;
} finally { await db.end(); }
