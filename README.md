> Latest: products can be sold by name, product number or uploaded photo; physical barcodes are optional. najd now uses one shared total quantity per product. Migration 004 retains a private pre-merge snapshot and keeps original branches and receipts for history. Legacy returns replenish the shared pool. The API chooses the inventory pool on the server; callers cannot select a separate stock bucket. Uploaded JPEG/PNG/WebP photos are resized in the browser and stored with the product in Neon.

> Current interface (2026-11-18): only Sale, Products/Quantities and Sales History. The expanded administration workspace, expense/report panels and payment dialog have been removed. Scan into a cart, edit quantities, then confirm a cash sale with one button. Neon persists real product/branch inventory and atomically commits sales; no local demo fallback.

# najd — الحسابات والبيع بالباركود

[Open najd](https://najd-pos.vercel.app) · [GitHub](https://github.com/islammosmar1/najd_cc)

Arabic RTL retail accounting and POS for **فرع الستي سنتر** and **فرع شارع أبو بكر**. The workspace has three screens: barcode sales, products/quantities, and sales history.

## Backend

The current application uses **Neon PostgreSQL + Managed Better Auth**, provisioned on Neon's `free_v3` plan through Vercel Marketplace. Supabase packages and browser access have been removed. `supabase/` is historical source, not the active migration directory. No existing NAJD COSMETICS database was changed.

All database access runs through Next.js route handlers. Each request verifies the Neon Auth session and executes business queries in a transaction using a restricted `authenticated` PostgreSQL role and RLS. `auth.users` maps the provider's opaque IDs to application UUIDs; it is not a password table. The approved owner email is server-side configuration and receives owner membership only after Neon confirms the email is verified. Other accounts receive no data access until assigned a membership.

The browser never receives a database password, session signing secret, or privileged database connection. Cookie signing uses a high-entropy secret in Vercel. SQL functions check current user, tenant, branch and role. Financial costs remain in a non-exposed private schema. Cashiers cannot directly write stock, read purchase costs or call financial functions.

## Workflows

- Add a product with its barcode, purchase cost, sale price and opening quantities for both branches in one atomic transaction.
- Scan by USB/Bluetooth HID keyboard scanner with Enter suffix, camera, or manual input. Repeated scans increment the cart. F2 focuses barcode input and F8 confirms the cash sale.
- Change an item's cart quantity directly or with +/−. Scanning itself does not deduct inventory.
- Confirm cash payment: database prices/tax, sale, payment, historical cost and stock deduction commit together. An internal cash shift is opened automatically with zero opening balance if needed.
- Open “المنتجات والكميات” to receive additional units or set a physical stock count. Exact corrections compare the displayed count under a row lock; a concurrent sale prevents stale counts from overwriting newer stock.
- Every actual stock change has a timestamp, reason, branch and responsible user. Duplicate checkout/quantity requests are protected by idempotency keys.
- Authorized screens refresh immediately after writes, on visibility changes, and every 15 seconds while visible. This is polling, not a realtime websocket guarantee. PostgreSQL transactions remain authoritative.

## First login

1. In the Neon resource's Auth → Configuration → Domains, allow `https://najd-pos.vercel.app`. An unlisted origin is rejected by the provider as `INVALID_ORIGIN`.
2. Open the application and choose “تسجيل الدخول”. Enter the approved owner email and request an email code. Enter the code yourself; never put it in source code or chat logs.
3. Successful email OTP sign-in verifies mailbox ownership. The server synchronizes the identity and gives the designated owner access to the two real branches. New uninvited accounts have no branch access.
4. Add actual products and quantities. Production starts empty; no demo sales are shown as real records.

Password login is also available for existing provider accounts. Passwordless first login does not require an administrator-created password. Hardware scanners and thermal printers still need physical acceptance testing.

## Development and configuration

Use Node.js 24 and npm. The repository contains no credentials. Pull the environment only from the verified linked `najd-pos` Vercel project:

```powershell
npm ci
npx vercel env pull .env.local --yes
npm run db:migrate
npm run dev
```

Required server environment keys are listed in `.env.example`: `DATABASE_URL`, `DATABASE_URL_UNPOOLED`, `NEON_AUTH_BASE_URL`, `NEON_AUTH_COOKIE_SECRET`, `NAJD_OWNER_EMAIL`. Keep `.env.local` and `.vercel/` ignored. Never use a `NEXT_PUBLIC_` prefix for these keys. The cookie secret must have at least 32 random characters.

Active migrations are in `database/migrations/`, applied in filename order by `scripts/migrate-neon.mjs`. Applied checksums are recorded; edited applied migrations are rejected. Migration 003 creates the empty najd business and the two branches once. Never apply the historical Supabase copies as additional migrations. Schema changes are deployment operations, not run by public HTTP requests.

The Vercel project uses Next.js, Node 24 and Frankfurt functions near the Neon database. Pushing `main` triggers deployment. Verify the latest build reaches READY before declaring a source update live.

## Tests

```powershell
npm test
npm run test:db
npm run test:concurrency
npm run test:live
npm run lint
npm run typecheck
npm run build
npm start -- --port 3001
# Separate terminal:
$env:E2E_BASE_URL='http://127.0.0.1:3001'
npm run test:e2e
```

Domain tests use Node's built-in test runner. Database tests apply the actual Neon migrations to isolated PGlite or native PostgreSQL clusters. Native concurrency tests use independent connections. `test:live` verifies creation/checkout/idempotency/18-15-33 quantities on the connected Neon database inside a transaction that rolls back all fixture data.

Playwright checks the real built Arabic interface, branch names, barcode input, auth form without sending emails, unauthorized writes and mobile layout. Authenticated cashier E2E requires an explicitly configured test account/product (`E2E_EMAIL`, `E2E_PASSWORD`, `E2E_BARCODE`) and makes a real sale; it skips when not configured. Do not point that test at normal production inventory.

Optional demonstration data can be generated only in a separate disposable database using `scripts/seed-demo.mjs`, an already synchronized test identity via `DEMO_EMAIL`, and `SEED_DEMO_CONFIRM=DISPOSABLE_NEON_TEST_DATABASE`. This has not been run on the real najd database.

## Practical limits

- Free Neon has usage/storage quotas; this is not a guarantee of unlimited free operation. Configure separate preview/test databases before running destructive development experiments. The initial integration connected the same resource to development, preview and production.
- Checkout is online only. Ambiguous network failures keep the sale frozen for a retry with the same key. Do not close/reload that page or create a replacement invoice until the sale's status has been checked. Durable recovery after a browser crash remains future work.
- Payments are cash. Card-provider integration, split payment, customer/supplier debt ledgers and partial refunds are not implemented.
- Variant creation, branch-price editing, supplier purchase UI, full English translation and image uploads remain incomplete. Historical schema support is not the same as a finished workflow.
- Current authorized workspace reads are suitable for a small store but need server-side pagination/aggregation before a large multi-year history. Refresh polling has a 15-second interval.
- Expenses are recorded independently of the cashier's physical drawer. Cross-shift refunds and opening-float reconciliation need operational review; reports are estimated retail profit, not a certified general ledger.
- Set an appropriate external backup/export schedule and rehearse restoration. No paid retention, restore guarantee, or recovery rehearsal is implied by choosing the free plan.

[Arabic operator manual](docs/USER_MANUAL_AR.md) · [Verification record](docs/VERIFICATION.md)
