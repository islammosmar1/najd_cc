# SmartBranch POS implementation

## Active architecture, 2026-11-18

The product is now **najd**, with the daily workspace focused on barcode sales, inventory quantities, accounts and invoice history. Neon PostgreSQL Free and Neon Managed Better Auth replace Supabase in the running application. The active migration source is `database/migrations/`; historical Supabase source is retained separately. Verified provider identities are mapped to application UUIDs server-side, then each business transaction runs as the RLS-limited authenticated role. No database connection credentials are sent to browsers. The designated owner's verified email is configured in Vercel rather than source control. Neon trusted-domain configuration is a separate launch requirement; it is not bypassed in application code.

Both branches have independent real stock. Cart scans are temporary, and confirmation commits sale/payment/cost/quantity movements atomically. The new quick sale operation creates a shift if needed inside the same transaction. Product creation can initialize both branch counts in one transaction. Physical quantity corrections require the current count to match what the employee reviewed. New period financial reports credit refunds and historical costs on the refund date. Default screen synchronization polls every 15 seconds while visible, with immediate refresh after writes.

The following original notes describe the initial Supabase implementation history.

The repository was empty. Architecture: Next.js App Router and TypeScript; Arabic RTL responsive client; Supabase cookie authentication; Postgres authorization, RLS and atomic RPC transactions; integer agorot for money; realtime is a refresh signal only.

Phases: (1) schema, tenant isolation and permissions; (2) authentication/catalog/inventory; (3) barcode POS/transactional checkout; (4) transfers, returns, shifts, expenses and reports; (5) automated transaction and UI checks; (6) deployment and Arabic operator documentation.

All production screens read database records. No automatic demo mode. No client service key. Financial costs live in a private schema. Client writes go through authenticated database functions. Each stock change creates a movement. Checkout takes ordered row locks and an idempotency advisory lock. Transfers remove stock on shipment and add it only on receipt. Cash payment is implemented; provider-confirmed cards need a provider integration.

Deployment target: Vercel/Next.js. Sites hosting is not used because its Worker runtime does not directly host this requested Next.js server build. An independent Supabase project must be configured; the existing NAJD COSMETICS project is not modified.
