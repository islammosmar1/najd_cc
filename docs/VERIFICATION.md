# Verification — 2026-11-17

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
