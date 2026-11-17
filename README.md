# najd POS

Company name: **najd**. The application was originally developed as SmartBranch POS.

Arabic-first retail POS built with Next.js 16, TypeScript, Tailwind 4, shadcn-style Radix components, Supabase Auth/Postgres/Realtime, React Hook Form/Zod, TanStack Table, Recharts, JsBarcode and ZXing. The initially empty repository contained no code to preserve.

**This is an implemented core with explicit remaining work, not a production-readiness certification.** It does not fabricate production data or silently sell offline. The existing NAJD COSMETICS database has not been changed. The requested independent Supabase project has not been provisioned or charged. Source: [islammosmar1/najd_cc](https://github.com/islammosmar1/najd_cc). The connected Vercel project is `najd-pos`; its live deployment still requires the independent Supabase configuration for real transactions.

## Run locally

Use Node.js 22+ (tested with 24) and npm.

```powershell
npm ci
Copy-Item .env.example .env.local
# Fill in the two NEXT_PUBLIC_SUPABASE_* values
npm run dev
```

Open http://127.0.0.1:3000. Without credentials, the actual application shows an empty setup state and disables transactions. There is no production mock-data fallback. The build and dev commands select webpack for reliable Windows worker behavior.

## Independent Supabase setup

1. Create a new Supabase project. Keep the database password in a password manager.
2. Apply the SQL file in `supabase/migrations/` using Supabase SQL Editor, or the CLI migration workflow. `supabase/schema.sql` is its readable source; don't apply both copies.
3. Enable email/password Auth and set Site URL and permitted redirect URLs for your local/Vercel origin. Disable public signup for an employee-only app. Create the owner account through Auth → Users.
4. Bootstrap the business and owner membership in SQL Editor as an administrator. Replace the email below. No public self-promotion endpoint exists:

```sql
do $$
declare uid uuid; biz uuid; br uuid;
begin
 select id into uid from auth.users where email = 'YOUR_OWNER_EMAIL';
 if uid is null then raise exception 'Create the Auth user first'; end if;
 insert into public.businesses(name) values ('متجري') returning id into biz;
 insert into public.branches(business_id,name,address)
 values (biz,'الفرع الرئيسي','') returning id into br;
 insert into public.memberships(business_id,user_id,role,display_name)
 values (biz,uid,'owner','مدير المتجر');
end $$;
```

5. Copy Project URL and **publishable** key to `.env.local`. Never use a service-role key as `NEXT_PUBLIC_*`. Restart the app.
6. Sign in, add branches and employee memberships. Employee Auth accounts must exist first. Owners may grant branch roles through the app; a global owner/admin membership is deliberately an administrative operation.
7. The migration adds inventory and sales to `supabase_realtime` when that publication exists. Verify those two tables are enabled under Database → Publications.
8. Run Supabase security/performance advisors on the new project before using real customer data. Review the business's tax and refund rules independently.

Authorization is enforced by database membership lookups, branch RLS, and narrow transaction functions. Browser writes cannot directly update stock, sales or roles. Financial cost tables are in a non-exposed private schema. Definer functions have an empty search path, explicit user/tenant/role checks, and revoked PUBLIC/anon execution. They are in `private`; public entry points are invoker wrappers. Keep `private` out of exposed API schemas. No service key is required by the application.

## Demo seed and walkthrough

Only use a dedicated **test** project. Apply the migration first. Set these server-side variables in your terminal without committing them:

```text
NEXT_PUBLIC_SUPABASE_URL
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY
SUPABASE_SERVICE_ROLE_KEY
DEMO_PASSWORD                 (at least 12 characters)
SEED_DEMO_CONFIRM=DEDICATED_TEST_PROJECT
```

Run `node --env-file=.env.local scripts/seed-demo.mjs`. It creates four real Auth users (`owner`, `cashier`, `inventory`, `accountant` at `smartbranch.example`), two branches, six products, independent stock, an open owner shift, a real sale and an expense. The password is the value you supply; it is never printed. Delete the service key from the application environment afterward. The script refuses to duplicate an existing demo. If setup fails partway, inspect the test project and remove the partial demo before retrying; the remote Auth/bootstrap process is not a single transaction.

The first demo product starts with 20 in A and 15 in B. The seed sells two in A through the real checkout function, leaving **18 / 15 / 33**. To repeat manually, create a fresh product, generate its Code 128 barcode, receive +20 in A and +15 in B, open a shift in A, scan twice and pay. Inventory shows A=18, B=15, total=33. Open a second authenticated browser on the other branch to verify the realtime refresh signal. Branch-only cashiers see only authorized branch quantities; owners see both.

## Barcode scanner setup

See [Arabic operator manual](docs/USER_MANUAL_AR.md). USB/Bluetooth scanners must use HID keyboard mode, with Enter as a suffix. F2 focuses the barcode field; F8 opens payment. EAN-13 and UPC-A scanners return their numeric codes; exact barcode lookup identifies the stocked variant. JsBarcode prints generated Code 128 labels. ZXing reads camera barcodes and falls back to keyboard/manual input when camera access fails. Camera access requires HTTPS (or loopback) and user permission. Actual scanners, device cameras and thermal printers still require hardware acceptance testing.

## Tests and verification

```powershell
npm test
npm run test:db
npm run test:concurrency
npm run lint
npm run typecheck
npm run build
npm start
# Another terminal; requires Microsoft Edge installed
npm run test:e2e
```

The database test executes the actual schema, RLS, definer/invoker grants and business functions inside PGlite (PostgreSQL). It verifies product uniqueness, branch isolation, retry keys, 18/15/33 checkout, full rollback, insufficient cash/stock, cost confidentiality, historical cost/receipt preservation, financial calculations, returns, transfer transitions and shift closing. `test:concurrency` runs that suite on a native local PostgreSQL server and additionally checks two simultaneous terminals selling the last unit and two simultaneous same-key requests. It binds only to 127.0.0.1:55439, creates its own cluster under ignored `.local/`, and stops it afterward. It does not connect to the hosted Supabase project. Auth is represented by the same `auth.uid()` interface through a test JWT setting; live Supabase Auth still needs separate acceptance testing.

Playwright setup/mobile tests run without a database. The live cashier test uses no mocked backend: supply `E2E_EMAIL`, `E2E_PASSWORD`, `E2E_BARCODE`, and optionally `E2E_BASE_URL`, against the seeded test project with an open shift. It deliberately skips if these inputs are missing. Never point it at production: it makes a real sale. The default browser is installed Microsoft Edge; change the channel if your system differs.

## Deploy to Vercel

1. Push this repository to your Git host and import it in Vercel as Next.js.
2. Set `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` for the intended environments. Use a separate test Supabase project for previews.
3. Build command: `npm run build`; install command: `npm ci`; no custom output directory.
4. Set the deployed HTTPS origin in Supabase Auth. Redeploy after changing public environment variables.
5. Test sign-in, permissions, checkout/retry, return, transfer receipt and realtime in two browsers before real use.

The deployment target is the connected Vercel project `najd-pos`. The Sites Worker runtime differs from the explicitly requested Next.js/Vercel server target; this deliverable preserves that stack. No payment provider has been connected. Card success is never simulated.

## Backup and recovery

Enable Supabase managed backups/PITR appropriate to your plan and retention needs. Store encrypted logical backups separately, including Auth-related recovery requirements and Storage objects (database dumps alone don't back up uploaded objects). Schedule periodic restores into a separate project, apply migrations, verify row counts, memberships, sale totals and inventory-movement reconciliation, and test sign-in before recovery cutover. Record RPO/RTO, rotate exposed credentials and review restored service integrations. Restore procedures must be rehearsed; no backup/restore has been run in this session.

## Implemented

- Responsive Arabic RTL workspace, branch/date filters, loading/empty/error states, toast feedback, accessible dialogs, keyboard shortcuts and printable receipts.
- Supabase password sign-in/sign-out, server-side user verification, six membership roles, branch RLS, confidential cost storage and audit records.
- Shared catalog, product create/edit, unique SKU/barcodes, CSV import/export, generated labels and bulk label print, optional HTTPS image URLs.
- Branch inventory, receiving/adjustments/damage through reasoned movements, low/out-of-stock status and full movement records.
- USB/HID/manual and camera scanning, event-burst deduplication, repeated scans, stock-limited cart, item/order discount, configurable tax, cash/change and full-sale refund/cancellation database operation.
- Atomic checkout with database prices, historical cost, ordered stock row locks, no negative stock, per-business idempotency keys and no direct writes.
- Pending/shipped/received/cancelled transfers, in-transit stock, destination-only receipt and duplicate receipt protection.
- Open/close cashier shifts, counted versus expected cash; expenses and database-derived financial totals, revenue chart, branch totals, best sellers and sales history.
- Environment example, source schema/migration, real demo seeder, transaction tests, browser tests and Arabic operator manual.

## Incomplete / production acceptance work

- Independent hosted project, actual credentials, remote migration/advisor verification, deployment and live two-browser realtime acceptance.
- Supplier purchasing/receiving UI and debt/payment ledger (purchase/supplier tables exist only); customer balances/credit sales and partial payments.
- Partial item returns, refund attribution across shifts, a dedicated void-sale UI, card-provider integration and split tender.
- Variant creation/size/color editor and branch-specific-price editor (schema supports them); bulk edit and native XLSX import (CSV only); actual image uploads (URL field only).
- Register assignment and configurable receipt templates; complete English translation (navigation/direction toggle is partial).
- Exact period accounting of later refunds: current reports exclude returned/cancelled original sales and are estimates, not a general ledger.
- External Auth integration tests, payment/hardware tests, monitoring/rate limiting, managed backup restore rehearsal, and load testing. Local real multi-connection concurrency is covered by `test:concurrency`.
- Large deployments need query-specific server pagination/aggregation rather than loading the authorized workspace. Current reads fetch every 500-row page to avoid silently truncating totals; this is correct for small stores but not tuned for large histories.
- Pending request keys persist only within the current page session. After a network ambiguity, retry the same open request before reloading; durable client recovery after a page/process crash needs work.

Do not treat the remaining items as implemented or the system as production-ready until its acceptance checks are complete.
