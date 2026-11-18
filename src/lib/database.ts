import "server-only";
import { Pool, type PoolClient } from "pg";
import { z } from "zod";
import { neonAuth } from "./auth/server";
const globalDb = globalThis as unknown as { najdPool?: Pool };
export const configured = () =>
  Boolean(
    process.env.DATABASE_URL &&
    process.env.NEON_AUTH_BASE_URL &&
    process.env.NEON_AUTH_COOKIE_SECRET &&
    process.env.NAJD_OWNER_EMAIL,
  );
export function pool() {
  if (!process.env.DATABASE_URL) throw Error("قاعدة البيانات غير متصلة");
  const url = new URL(process.env.DATABASE_URL);
  if (url.hostname.endsWith(".neon.tech"))
    url.searchParams.set("sslmode", "verify-full");
  return (globalDb.najdPool ??= new Pool({
    connectionString: url.toString(),
    max: 5,
    idleTimeoutMillis: 10000,
    connectionTimeoutMillis: 10000,
  }));
}
export async function currentUser() {
  if (!configured()) return null;
  const { data: session, error } = await neonAuth().getSession();
  if (error || !session?.user) return null;
  const user = session.user;
  const client = await pool().connect();
  try {
    await client.query("begin");
    const { rows } = await client.query<{ id: string }>(
      `insert into auth.users(id,email,provider_id) values(gen_random_uuid(),$1,$2) on conflict(provider_id) do update set email=excluded.email returning id`,
      [user.email, user.id],
    );
    const id = rows[0].id;
    // A verified provider email, never client metadata, identifies the owner.
    if (
      user.emailVerified &&
      user.email.toLowerCase() ===
        process.env.NAJD_OWNER_EMAIL?.trim().toLowerCase()
    )
      await client.query(
        `insert into public.memberships(business_id,user_id,role,display_name) select business_id,$1,'owner',$2 from private.company_setup where singleton on conflict(business_id,user_id,branch_id) do nothing`,
        [id, user.name || "مدير najd"],
      );
    await client.query("commit");
    return {
      id,
      email: user.email,
      emailVerified: Boolean(user.emailVerified),
    };
  } catch (error) {
    try {
      await client.query("rollback");
    } catch {}
    throw error;
  } finally {
    client.release();
  }
}
export async function asUser<T>(
  id: string,
  run: (client: PoolClient) => Promise<T>,
  readOnly = false,
) {
  z.uuid().parse(id);
  const client = await pool().connect();
  try {
    await client.query(readOnly ? "begin read only" : "begin");
    await client.query("set local role authenticated");
    await client.query("select set_config('request.jwt.claim.sub',$1,true)", [
      id,
    ]);
    const result = await run(client);
    await client.query("commit");
    return result;
  } catch (error) {
    try {
      await client.query("rollback");
    } catch {}
    throw error;
  } finally {
    client.release();
  }
}
const functions = [
  "checkout",
  "quick_checkout",
  "command",
  "set_stock",
  "add_product",
  "financials",
  "product_detail",
] as const;
export async function rpc(
  id: string,
  name: (typeof functions)[number],
  args: unknown[],
) {
  if (!functions.includes(name)) throw Error("عملية غير مسموحة");
  return asUser(id, async (client) => {
    const params = args.map((_, i) => "$" + (i + 1)).join(",");
    const { rows } = await client.query(
      `select public.${name}(${params}) as result`,
      args,
    );
    return rows[0].result;
  });
}
