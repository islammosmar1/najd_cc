# SmartBranch POS implementation

The repository was empty. Architecture: Next.js App Router and TypeScript; Arabic RTL responsive client; Supabase cookie authentication; Postgres authorization, RLS and atomic RPC transactions; integer agorot for money; realtime is a refresh signal only.

Phases: (1) schema, tenant isolation and permissions; (2) authentication/catalog/inventory; (3) barcode POS/transactional checkout; (4) transfers, returns, shifts, expenses and reports; (5) automated transaction and UI checks; (6) deployment and Arabic operator documentation.

All production screens read database records. No automatic demo mode. No client service key. Financial costs live in a private schema. Client writes go through authenticated database functions. Each stock change creates a movement. Checkout takes ordered row locks and an idempotency advisory lock. Transfers remove stock on shipment and add it only on receipt. Cash payment is implemented; provider-confirmed cards need a provider integration.

Deployment target: Vercel/Next.js. Sites hosting is not used because its Worker runtime does not directly host this requested Next.js server build. An independent Supabase project must be configured; the existing NAJD COSMETICS project is not modified.
