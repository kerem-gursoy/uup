# Migrate to Cloudflare Workers + D1

## Context

The app (`/Users/kg/code/uup`) is a small internal inventory/invoicing tool: Express 5 + Prisma/SQLite server, React/Vite client, Gemini-powered OCR for invoice parsing, camera barcode scanning. It currently runs as a local Node process against a file-based SQLite DB (`server/prisma/dev.db`) with invoice images on local disk (`server/src/uploads/invoices/`). There is no Cloudflare setup, CI/CD, or Docker today — this is a from-scratch deploy.

Goal: get this live on Cloudflare's free tier (Workers + D1 for the API/DB, Pages for the client), with no custom domain and no production data to preserve (current `dev.db` and sample invoice files are disposable test data — confirmed with the user). Per the user's standing preference, favor quality/simplicity/long-term maintainability over minimizing dev effort.

**Framework note:** the plan originally proposed rewriting the API in Hono, on the assumption Express couldn't run on Workers. That assumption is outdated — Cloudflare added native `node:http` support (`http.createServer` + `httpServerHandler`) that lets Express run as-is under the `nodejs_compat` flag, confirmed via Cloudflare's own current docs. The user opted to keep Express. This turns out to shrink the port significantly: `nodejs_compat` (required for Express regardless) also unlocks `Buffer`, `node:crypto`, and `process.env` populated from Workers bindings/secrets — so `jsonwebtoken`, `cookie-parser`, and the Gemini base64 encoding all keep working completely unchanged, and multer can stay (just swapped from disk to memory storage). The only universal, framework-independent blockers remain: D1's lack of interactive transactions, and the filesystem itself not existing on Workers.

## Key decisions

| Decision | Choice | Why |
|---|---|---|
| API framework | **Keep Express 5**, bridged via `node:http` | Native support since Cloudflare's `httpServerHandler`/`enable_nodejs_http_server_modules` work — auto-enabled for compatibility dates ≥ 2025-09-01 (ours is 2026-07-29). No route rewrite needed; only the entry-point bottom (`app.listen` → `httpServerHandler`) changes. |
| JWT / cookies | **Keep `jsonwebtoken` + `cookie-parser`**, no change | Both depend on APIs (`node:crypto`, plain string parsing) that `nodejs_compat` now provides. Rewriting to `hono/jwt` would have been pure churn with Express staying. |
| Secrets/env access | **`process.env.X` keeps working as-is** | `nodejs_compat_populate_process_env` (default for compat dates ≥ 2025-04-01) mirrors Workers vars/secrets into `process.env`. Zero changes to how `auth.ts`/`middleware/auth.ts`/`gemini.ts` read `JWT_SECRET`/`GEMINI_API_KEY`. |
| Password hashing | Switch to **WebCrypto PBKDF2** (`crypto.subtle`), drop `bcryptjs` | `bcryptjs` at cost-10 burns ~200ms CPU per hash — 20x over the free plan's 10ms CPU/request cap, so every login/register would fail with "exceeded CPU time." Native `crypto.subtle.deriveBits` is hardware-backed and fits the budget; Workers caps PBKDF2 at 100,000 iterations (SHA-256) anyway, which is what we'll use. This is independent of the Express/Hono question — it's a D1/Workers-platform constraint either way. |
| DB access | **`@prisma/adapter-d1`**, per-request `PrismaClient` via `import { env } from "cloudflare:workers"` | D1 binding I/O isn't allowed outside a request context, so the current module-level `new PrismaClient()` singleton (`server/src/lib/prisma.ts`) can't survive as a true top-level singleton. A small `getPrisma()` factory called at the top of each request handler replaces it. |
| File storage | **R2 bucket**, `multer.memoryStorage()` instead of `diskStorage` | Workers has no filesystem regardless of framework. Switching multer's storage engine (not removing multer) buffers the upload as `req.file.buffer` in memory — no Hono-style manual `formData()` parsing needed, smallest possible diff. That buffer is written straight to R2; `Invoice.storedPath` keeps its column/shape, now holding an R2 object key. No schema change. |
| Auth cookie | `sameSite: 'None', secure: true` (unconditional, no `NODE_ENV` branch) | No custom domain → Worker (`*.workers.dev`) and Pages (`*.pages.dev`) are different registrable domains, so today's `sameSite: 'lax'` cookie would silently stop being sent after login. `None`+`Secure` fixes this with zero DNS work. |
| CORS | Explicit origin allow-list function (never `*`) | `credentials: true` CORS forbids wildcard origin; must include the Pages prod URL and cover Pages preview-deploy subdomains. |
| Client hosting | **Cloudflare Pages** | Pure Vite SPA, no SSR — needs only a build command and a `_redirects` SPA fallback. |
| Data migration | **None** — fresh/empty D1 | Confirmed with user: current `dev.db`/sample invoice files are test data, not worth preserving. |
| Admin scripts | Rewrite to hash locally (same PBKDF2 module) + `wrangler d1 execute --remote` via `execFileSync` (argv array) | No new deps, no shell-injection risk, no bespoke admin HTTP endpoint to secure. |
| KV | Not used | Nothing needs a cache/session store beyond the JWT cookie. |

## Bindings & secrets (`server/wrangler.jsonc`, new file)

```jsonc
{
  "name": "uup-api",
  "main": "src/index.ts",
  "compatibility_date": "2026-07-29",
  "compatibility_flags": ["nodejs_compat"],
  "d1_databases": [{ "binding": "DB", "database_name": "uup-db", "database_id": "<from wrangler d1 create>" }],
  "r2_buckets": [{ "binding": "INVOICES_BUCKET", "bucket_name": "uup-invoices" }],
  "vars": { "ALLOWED_ORIGINS": "https://uup.pages.dev,http://localhost:5173,http://127.0.0.1:5173" }
}
```
`enable_nodejs_http_server_modules` (needed for `http.createServer`) is auto-enabled at this compatibility date, so it doesn't need listing explicitly — worth double-checking `wrangler --version` supports it at execution time regardless.

Secrets (`wrangler secret put <NAME>`, never in this file): `JWT_SECRET` (generate via `openssl rand -base64 48`, no fallback string anywhere in Worker code — unlike today's `"super-secret-dev-key"` default), `GEMINI_API_KEY`. For local dev use a gitignored `server/.dev.vars` — add `.dev.vars` to `.gitignore` explicitly, since the existing `*.env` patterns there don't match it.

## Cost — staying on Cloudflare's free tier

Expected free-tier headroom for a single-tenant internal tool:

| Service | Free allowance | This app's usage |
|---|---|---|
| Workers | 100k requests/day, 10ms CPU/request, 3MB script | Low request volume; Express's own dispatch overhead is sub-millisecond for a route table this small — the only real CPU risk was `bcryptjs` (fixed via PBKDF2 above) |
| D1 | 5GB storage, 5M rows read/day, 100k rows written/day | Trivial for product/supplier/price/stock tables at this scale |
| R2 | 10GB storage, 1M Class A (write) ops/month, 10M Class B (read) ops/month | Invoice images only — thousands of uploads/month before this is a concern |

This should run at **$0/month**. If usage ever grows enough to need more CPU time or a higher script-size ceiling, Workers Paid is $5/month flat — not a redesign, just a plan upgrade.

## Phase 0 — Hygiene (do first, independent of everything else)

- Rotate the Gemini key (currently plaintext in `server/.env`; confirmed not committed to git history, but rotate anyway since it's moving into Wrangler secrets).
- Generate `JWT_SECRET`.

## Phase 1 — Scaffold, old Express app untouched

1. `cd server && npx wrangler d1 create uup-db` (grab `database_id`); `npx wrangler r2 bucket create uup-invoices`.
2. Add deps: `@prisma/adapter-d1`, `wrangler`, `@cloudflare/workers-types`. Remove `better-sqlite3`/`@prisma/adapter-better-sqlite3` (already-dead deps) and `bcryptjs` (replaced by PBKDF2).
3. `server/prisma/schema.prisma`: add `previewFeatures = ["driverAdapters"]` to `generator client`. Datasource (`provider = "sqlite"`) and all 6 models stay unchanged — D1 is SQLite, no model changes needed.
4. Baseline D1 schema directly from current Prisma schema (skip replaying the 6 historical migrations — their `PRAGMA defer_foreign_keys` rebuild steps are artifacts of past SQLite `ALTER TABLE` limits, irrelevant to a brand-new DB):
   ```
   npx prisma migrate diff --from-empty --to-schema-datamodel ./prisma/schema.prisma --script --output server/migrations/0001_baseline.sql
   npx wrangler d1 migrations apply uup-db --local
   ```
5. `server/tsconfig.json`: switch to `moduleResolution: "Bundler"` / `module: "ESNext"`, drop `outDir`/`build` emit (Wrangler's esbuild bundles `src/index.ts` directly at deploy regardless of framework; keep `tsc --noEmit` only for type-checking).
6. `npx wrangler types` to generate the `Env` type from bindings.

**Verify:** `npx wrangler dev` boots a minimal Express app bridged via `httpServerHandler` (see Phase 2); local D1 shows all 6 tables (`npx wrangler d1 execute uup-db --local --command="select name from sqlite_master where type='table'"`).

## Phase 2 — Port to Workers, full local parity (against local D1 + R2 via `wrangler dev`)

- **`server/src/index.ts`**: routes, controllers, and middleware order stay exactly as today (CORS → `express.json()` → `cookieParser()` → public `/auth/*` routes → `app.use(requireAuth)` → protected routes). Only the bottom changes:
  ```ts
  import { createServer } from "node:http";
  import { httpServerHandler } from "cloudflare:node";
  // ...(all existing app.get/post/... wiring unchanged)...
  const server = createServer(app);
  export default httpServerHandler(server);
  ```
  (replaces `app.listen(PORT, ...)`).
- **`server/src/lib/prisma.ts`**: replace the module-level `export const prisma = new PrismaClient()` singleton with:
  ```ts
  import { env } from "cloudflare:workers";
  import { PrismaD1 } from "@prisma/adapter-d1";
  export const getPrisma = () => new PrismaClient({ adapter: new PrismaD1(env.DB) });
  ```
  D1 I/O isn't permitted outside a request context, so this must be called fresh inside each request — add a thin Express middleware right after `cookieParser()`: `app.use((req, res, next) => { req.prisma = getPrisma(); next(); })` (extend the Express `Request` type via declaration merging). Every controller (`auth.ts`, `suppliers.ts`, `products.ts`, `reports.ts`, `invoices.ts`) swaps its `import { prisma } from "../lib/prisma.js"` for `req.prisma`. Service functions defaulting a `tx: Prisma.TransactionClient = prisma` param (e.g. `server/src/services/inventory.ts`) lose that default and take the client explicitly from the caller.
- **`server/src/services/invoiceApply.ts` — real refactor, not a mechanical port.** `applyInvoice()` (line 31) currently does `prisma.$transaction(async (tx) => {...})` with conditional per-line reads (`tx.product.findUnique`) interleaved with writes — D1's adapter doesn't support this interactive-transaction form, only atomic batch execution of a pre-built statement array. This is independent of the Express/Hono decision. Restructure to: (1) do validation reads (invoice status, per-line product lookups) as plain non-transactional queries first — fine for a single-tenant, low-concurrency tool; (2) build an array of write operations (`stockMovement.create`, `recordPrice`, `invoice.update`) without awaiting; (3) commit atomically via `prisma.$transaction([...ops])` (the batch/array form, which D1 does support). This is the one place a naive line-by-line port will compile but misbehave at runtime.
- **`server/src/controllers/invoices.ts`**: keep `multer`, just swap `multer.diskStorage({...})` for `multer.memoryStorage()` — route wiring (`invoiceUpload.single("file")`) is unchanged. In `uploadInvoice`, instead of building a disk path from `req.file.filename`, generate an R2 key (`crypto.randomUUID() + ext`) and write with `await env.INVOICES_BUCKET.put(key, req.file.buffer, { httpMetadata: { contentType: req.file.mimetype } })`; store that key in `Invoice.storedPath` exactly as today. Still enforce the existing 5MB `limits.fileSize` (multer handles this natively, no manual check needed).
- **`server/src/services/invoiceParsing.ts`**: replace `fs.readFile(filePath)` with:
  ```ts
  import { env } from "cloudflare:workers";
  const obj = await env.INVOICES_BUCKET.get(invoice.storedPath);
  if (!obj) throw new Error("Invoice file not found in storage");
  const fileBuffer = Buffer.from(await obj.arrayBuffer());
  ```
  `Buffer` is available via `nodejs_compat`, so this is the only line that changes in this file.
- **`server/src/services/gemini.ts`**: **no changes** — `Buffer.toString("base64")` keeps working since `Buffer` is available natively under `nodejs_compat`. (The earlier draft of this plan proposed a hand-rolled `ArrayBuffer`→base64 chunking function specifically to avoid needing `nodejs_compat`; since Express requires that flag anyway, this workaround is unnecessary.)
- **`server/src/controllers/auth.ts` / `server/src/middleware/auth.ts`**: no JWT/cookie library changes (see decisions table). Only two edits: (1) swap the `prisma` import for `req.prisma` like other controllers, (2) call the new PBKDF2 module instead of `bcrypt.hash`/`bcrypt.compare`.
- **Password hashing — new `server/src/services/passwordHash.ts`, drop `bcryptjs`**: hash via `crypto.subtle.deriveBits({name:'PBKDF2', salt, iterations: 100_000, hash:'SHA-256'}, ...)` over a random 16-byte salt, store as a single string `pbkdf2$100000$<saltB64>$<hashB64>` in `User.password` (same column, no schema change). `verifyPassword(password, stored)` parses the string, re-derives with the stored salt/iteration count, and does a constant-time compare. Both `register`/`login` in `auth.ts` and the admin script below use this module, so hashing logic exists in exactly one place. `globalThis.crypto.subtle` is available in both Node 20 (for the local script) and Workers, so the format is identical either way.
- **`server/scripts/`**: replace `create-user.ts` + `set-password.ts` with one `admin-user.ts` that imports `server/src/services/passwordHash.ts`, then runs `execFileSync("npx", ["wrangler","d1","execute","uup-db","--remote","--command", sql], ...)` (argv array, not a shell string — avoids injection).

**Verify (all against local `wrangler dev` D1/R2 before touching real Cloudflare resources):**
- Register/login/me/logout roundtrip (cookie set/read correctly via `cookie-parser`, unchanged).
- Full product/supplier/stock/price CRUD.
- Invoice upload → file lands in simulated R2, `storedPath` is an R2 key.
- Invoice parse → Gemini call succeeds with the unchanged `Buffer`-based encoding, file round-trips through the new R2 read.
- Invoice apply → exercises the refactored batch-transaction path; confirm a bad `productId` still aborts before any writes land.
- The raw `$queryRaw` window-function query in `server/src/services/inventory.ts` (`ROW_NUMBER() OVER (PARTITION BY...)`) against local D1 — hit `/products` and `/reports/attention`, sanity-check output shape.
- Duplicate-barcode / duplicate-`nameKey` (`P2002`) errors still surface correctly through the D1 adapter.
- Large-ish (near 5MB) invoice upload through the `httpServerHandler` bridge specifically — this Node-http-on-Workers path is newer than the rest of the stack, worth confirming it handles a real multipart body correctly rather than just trusting it from docs.

## Phase 3 — Cross-origin cookie/CORS

- Cookie: `res.cookie("token", jwt, { httpOnly: true, secure: true, sameSite: "none", maxAge: 7*24*60*60*1000 })`, unconditional (no `NODE_ENV` branch — Workers is always HTTPS, and `http://localhost` counts as a secure context for local testing).
- CORS: allow-list function reading `ALLOWED_ORIGINS`, plus a `.pages.dev` suffix check to cover unpredictable Pages preview-deployment subdomains (the current hardcoded two-origin array in `cors({origin: [...]})` becomes a function).

**Verify:** deploy client to a Pages preview URL pointed at the Worker; confirm login sets the cookie AND a subsequent authenticated request from the `*.pages.dev` origin actually carries it back to the `*.workers.dev` origin. This is the single most important check — get it wrong and login silently "succeeds" while every following call 401s.

## Phase 4 — Deploy Worker

1. `wrangler secret put JWT_SECRET`, `wrangler secret put GEMINI_API_KEY`.
2. `npx wrangler d1 migrations apply uup-db --remote` (schema before code).
3. `npx wrangler deploy` → note the `*.workers.dev` URL.

**Verify:** `curl -i` the deployed `/` health check and `/auth/login`; confirm `Set-Cookie` has `SameSite=None; Secure`.

## Phase 5 — Deploy client to Pages

- New `client/public/_redirects`: `/* /index.html 200` (SPA fallback for deep links like `/products/5`).
- Pages project: build command `npm run build`, output `dist`, env var `VITE_API_URL` = the Worker URL from Phase 4 — `client/src/services/api.ts` already reads this, no client code changes needed.
- `client/vite.config.ts` unchanged (its `server.proxy`-less config is dev-only).

**Verify:** full smoke test against the real deployed stack — login, product CRUD, barcode scan (camera over Pages' default HTTPS, no config needed), invoice upload → R2 → Gemini parse → apply.

## Phase 6 — Cutover

No data migration needed (per user: current data is disposable test data). Once Phase 5's smoke test passes: point real usage at the Pages URL, create the real user account via `server/scripts/admin-user.ts`, and retire the old local Express process/`dev.db` whenever convenient.

## Risks called out explicitly

- PBKDF2 at 100,000 iterations (Workers' platform cap) is below current OWASP guidance (600k for SHA-256) — a deliberate security/CPU-budget tradeoff, acceptable for a small internal single-tenant tool but worth knowing it's not bank-grade. If CPU errors still show up in testing, drop iterations further (e.g. 60k) rather than raising them.
- `@prisma/adapter-d1` is still Prisma-labeled "Preview" — pin `prisma`/`@prisma/client`/`@prisma/adapter-d1` versions together, re-run the Phase 2 verify checklist on any bump.
- The batch-transaction refactor (Phase 2, `invoiceApply.ts`) is a genuine behavior change, not just an import swap — the one spot where a rushed port compiles but breaks at runtime, regardless of framework choice.
- Express-via-`httpServerHandler` is a newer (~1 year old) Cloudflare capability than raw fetch-handler Workers — the Phase 2 verify list includes a real-sized multipart upload specifically to build confidence in this bridge, since it's less battle-tested than the rest of the stack.
- Per-request `PrismaClient` construction (via `getPrisma()`) is correct for Workers but a mental-model shift from today's singleton — worth a one-line comment in `lib/prisma.ts` so a future maintainer doesn't "helpfully" hoist it back to module scope.

## Critical files

- `server/src/index.ts` — unchanged routing, only the entry-point bottom (`app.listen` → `httpServerHandler`)
- `server/prisma/schema.prisma` — add `driverAdapters` preview feature
- `server/src/lib/prisma.ts` — singleton replaced by `getPrisma()` factory + request middleware
- `server/src/services/invoiceApply.ts` — batch-transaction refactor
- `server/src/controllers/invoices.ts` — multer storage engine swap (disk → memory) + R2 write
- `server/src/services/invoiceParsing.ts` — R2 read instead of `fs.readFile` (one line)
- `server/src/services/gemini.ts` — unchanged
- `server/src/middleware/auth.ts`, `server/src/controllers/auth.ts` — unchanged JWT/cookie libs; `req.prisma` + PBKDF2 calls only
- `server/src/services/passwordHash.ts` (new) — PBKDF2 via WebCrypto, replaces `bcryptjs`
- `server/wrangler.jsonc` (new), `server/tsconfig.json` (bundler mode)
- `server/scripts/admin-user.ts` (new, replaces `create-user.ts`/`set-password.ts`)
- `client/public/_redirects` (new)
