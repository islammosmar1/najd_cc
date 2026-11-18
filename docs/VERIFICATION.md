# Automatic continuous camera scanning — 2026-11-18

The authenticated sale screen now starts its inline camera automatically, keeps it open after scans, and stops it on leaving sales, logging out, or opening a committed receipt. Pending checkouts suspend scanning. A visible stop/start control remains available. Browser camera permission is still required.

A presence gate counts a barcode held in view once, then re-arms after one second without detection; different codes can follow without a capture button. Validation: production build, TypeScript, ESLint, 12 domain checks and five browser checks passed. The camera browser check uses an actual canvas MediaStream: a CODE128 is recognized without clicking a scanner/capture button, remains one unit while held for 2.2 seconds, and becomes two after removal/re-presentation. It uses isolated API/auth fixtures and a virtual stream, not the user's physical webcam or production sales. Real-device focus and permission still depend on the browser/hardware.

## Earlier verification

# Laptop barcode scanning update — 2026-11-18

The scanner now requests ideal 1920x1080 video, enables TRY_HARDER decoding, allows camera selection when available, and provides a barcode-image fallback even when camera permission/device access fails. Decoded unmatched values are shown explicitly; identical camera results are suppressed within the dialog. Matching normalizes Unicode formatting and Arabic/fullwidth digits while retaining leading zeros and rejecting ambiguous matches. A visible Add button supports manual entry.

Validation: production build, TypeScript, ESLint and 11 domain checks pass. Five isolated browser checks pass, including actual ZXing decoding of generated CODE128 PNG images: an unknown decoded value remains visible; a registered value with leading zeros adds the correct product; Arabic digit manual entry adds the same product. These tests use local routed auth/data fixtures, send no email and create no production sale. The user's physical webcam/focus was not tested. Read-only live diagnostics found three saved barcodes, with no Arabic digits, surrounding spaces or AUTO placeholders; no customer barcode records were changed.

## Earlier verification

# Shared inventory / optional barcode update — 2026-11-18

- Migration 004 was verified inside a rollback-only transaction on the actual Neon database before application. Existing per-product totals were compared before/after. The 20+15 fixture preserves 35; a pre-merge sale/return restores the new pool; new sales and retries give 33 exactly once; total correction gives 10; stale counts and overselling are rejected. The private pre-merge snapshot and balanced movement records preserve the migration trail.
- 30 native PostgreSQL transaction/RLS/concurrency checks pass. They use separate test businesses, retaining coverage of legacy branch behavior while the configured najd company uses a shared pool.
- Five isolated browser checks pass, including image upload/resizing, optional barcode/leading-zero scanning, sale by product name/photo with no physical barcode, one total opening quantity and one sale request. Browser fixtures do not send mail or alter production sales. Actual email/hardware checks remain manual.
- Production build, TypeScript and ESLint pass. Domain validation covers omitted barcodes and disallows executable image data formats.
- The server resolves the pool for catalog/quantity/checkout commands. Historical receipt branches remain unchanged; returns retain their receipt branch for authorization and route restored units into the pool.

## Previous verification records

# Simplified desk verification — 2026-11-18

The three-tab interface removes expanded administration, account/expense panels and the separate cash payment dialog. The data endpoint now loads only the catalog, authorized branches, memberships, inventory and sales required by this desk. The retained database transactions and RLS remain unchanged.

- Production build, TypeScript, ESLint and 9 domain checks pass.
- Live Neon rollback check passes: create a product with 20/15 units, sell two -> 18/15, retry without another deduction, retain historical cost. All fixtures rolled back.
- Four browser checks pass: unauthenticated write/origin protection, email-code form, mobile three-tab layout, and isolated UI contract for product scanner Enter, barcode leading zeros, two scans, one sale request and refreshed quantities. The contract check uses local routed fixtures; it is not a claim of a real authenticated browser sale.
- Auth production origin was verified after the user's domain change: a nonexistent-account password request returned INVALID_EMAIL_OR_PASSWORD rather than INVALID_ORIGIN. No email was sent by this check.
- Physical scanner/printer and actual email delivery remain on-device checks. The historical authenticated cashier test remains skipped without an explicit test account.

## Earlier records (historical)

# Verification — 2026-11-17

## Current Neon / simplified workspace update — 2026-11-18

The active backend is now Neon Free (`free_v3`) with Managed Better Auth. Real, empty company and branch records were created for najd, فرع الستي سنتر, and فرع شارع أبو بكر. The old NAJD COSMETICS project was not modified. Owner assignment requires a provider-verified email matching private server configuration. Credentials and cookie secrets are stored in Vercel/ignored environment files.

- 9 domain checks pass using Node's built-in test runner: barcode identity, repeated scans, no deduction during scanning, stock limits, deduplication, money/tax, typed quantities and uncertain request errors.
- 28 migration/transaction/RLS checks pass on PGlite.
- 30 checks pass on native PostgreSQL, including actual simultaneous quick checkouts and duplicate submissions through two connections.
- The connected Neon database passed a rollback-only live check: named branches, atomic product creation with 20/15 quantities, sale of 2 giving 18/15/33, exactly-once retry and historical purchase cost. All temporary records were rolled back.
- The Next.js production build and TypeScript check passed. ESLint passed after scanner callback ordering was corrected.
- Three browser checks passed on the built app: the simplified four-screen desk, protected checkout/barcode errors, email-code form without sending mail, mobile RTL and inventory/accounts navigation. Screenshots are in ignored `.local/najd-desktop.png` and `.local/najd-stock-mobile.png`.
- Authenticated cashier browser E2E remains skipped without an explicit test account. Real hardware and email delivery are not claimed as tested.
- Neon rejects the production origin until the website is added in Auth → Configuration → Domains. `INVALID_ORIGIN` was confirmed with a nonexistent-account sign-in request; no email was sent. The user has been given the direct configuration steps. No origin validation has been bypassed or weakened.
- The package audit reported a transitive glob-matching advisory through Better Auth's optional test-runner peer. Node's built-in runner now executes the domain tests. The flagged Vitest/picomatch/tinyglobby files were absent from the inspected Next.js function traces, but the dependency advisory remains recorded; the old 2026-11-17 audit result below is historical and must not be read as a current all-dependency guarantee. No incompatible forced downgrade was applied.

The new interface uses transactional quick checkout with automatic zero-balance shift creation, editable cart quantities, atomic two-branch opening stock and a compare-and-set inventory count. Account reports recognize later full refunds in the refund period. Visible sessions refresh every 15 seconds and after writes; this is polling rather than websocket realtime.

## Publication update

The company branding is now **najd**. Source was published to `islammosmar1/najd_cc` after the user explicitly approved its public visibility. The verified Vercel target is `islammosmar1s-projects/najd-pos` (Next.js, Node 24). Production at https://najd-pos.vercel.app returned HTTP 200 with title `najd POS | إدارة فروعك بذكاء`. GitHub `main` is connected for automatic deployments. Supabase credentials remain unconfigured; no independent hosted database was created or changed. Vitest was updated to 5.1.0 after the remote build disclosed development-dependency vulnerabilities; the publication check results are separate from the original core test record below.

## Original core implementation checks

The implemented story is: authenticate → choose an authorized branch → open a shift → scan exact variants into a cart → POST validated checkout → one PostgreSQL transaction → persist sale/payment/historical cost and deduct inventory → render the database receipt and refresh branch data.

| Check | Result | Evidence |
|---|---|---|
| TypeScript | Passed | `npm run typecheck` |
| ESLint | Passed without warnings | `npm run lint` |
| Production build | Passed | `npm run build` (Next.js 16.4.6, webpack) |
| Domain tests | 8 passed | `npm test` |
| PostgreSQL/PGlite | 24 passed | `npm run test:db` |
| Native PostgreSQL | 26 passed | `npm run test:concurrency`, including two real independent connections |
| Browser setup and mobile | 2 passed | `npm run test:e2e`, headless installed Microsoft Edge |
| Live Supabase cashier E2E | Skipped | Independent project credentials and real test account not configured |
| Production dependency audit | 0 known vulnerabilities | `npm audit --omit=dev --audit-level=high` |
| Migration consistency | Matched | Source schema and generated migration SHA-256 hashes match |

Native database coverage includes: product/barcode uniqueness, stock receipt per branch, command idempotency, direct write denial, cashier branch RLS and cost isolation, permissioned cost details, shift opening, 18/15/33 sale scenario, duplicate checkout, mismatched idempotency body, insufficient stock/cash rollback, duplicate variants, unauthorized branches, historical COGS, receipt preservation, full refunds/cancellation, transfer shipping/receipt/cancellation and duplicate receipt, nonnegative stock, shift closing, unrelated tenant isolation, simultaneous last-unit sale, and simultaneous same-key requests. The local Auth schema is a test implementation of `auth.uid()`, not a test of hosted Supabase's Auth service.

Browser coverage confirms the actual production build renders Arabic RTL, disables checkout without configuration, handles unknown barcode input, rejects foreign origins, accepts the correct local origin up to the expected configuration check, and fits a 390px mobile viewport. Screenshots are in ignored `.local/dashboard-desktop.png` and `.local/products-mobile.png`.

Defects found and fixed during verification: form resolver input/output types, currency field initialization, ambiguous SQL tax name, local Origin comparison, React ref rendering, deterministic versus ambiguous request failures, retry key preservation, receipt pricing/tax on retries, confidential product-cost loading, historical receipt names, and temporary native PostgreSQL shutdown on Windows.

The browser-to-live-Supabase boundary remains unverified because no independent hosted project is configured. No external data was altered, no payment provider was connected, no backup/restore was performed, and no hosted deployment was published. Hardware scanners, cameras and printers require on-device acceptance. README documents functional omissions and operational limitations. Passing these checks is not a claim of production readiness or absence of defects.
