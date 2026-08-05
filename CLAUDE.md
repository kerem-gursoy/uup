# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

An internal inventory tool for a single shop: products, suppliers, stock and cost
history, barcode scanning, and a review screen that turns a photographed supplier
invoice into stock movements. Turkish and English, Turkish first. Deployed as one
Cloudflare Worker.

## Layout and commands

There is **no root `package.json`**. Two npm packages, and every command below runs
from `client/` or `server/`.

```
client/           Vite + React 19 + TS + Tailwind v4  -> built to client/dist
server/           Express on Workers, Prisma, D1, R2  -> the Worker itself
migrations/       D1 SQL migrations (applied by wrangler, not by Prisma)
wrangler.jsonc    one config for both halves, at the repo root
```

**Development needs two processes.** Vite proxies `/api` to `wrangler dev` on 8787
so that a relative `/api` path is correct in dev and production alike:

```bash
cd server && npm run dev      # wrangler dev, port 8787 - API + bindings
cd client && npm run dev      # vite, port 5173 - host:true, so a phone on the LAN can reach it
```

```bash
cd client && npm run build    # tsc -b && vite build
cd client && npm run lint     # eslint
cd client && npm test         # vitest run
cd client && npx vitest run src/lib/format.test.ts        # one file
cd client && npx vitest run -t "starts every line selected"   # one test by name

cd server && npm run typecheck   # tsc --noEmit
cd server && npm run build       # wrangler deploy --dry-run, the only server-side build check
cd server && npm run types       # regenerate worker-configuration.d.ts after changing bindings
```

Tests are client-only (5 files, vitest + jsdom). There is no server test suite.

**Deploy** builds the client and ships the Worker in one step:

```bash
cd server && npm run deploy
cd server && npm run db:migrate:remote     # production D1; --local variant for dev
```

`wrangler deploy` ships **the current working tree**, not a merged branch. Deploying
from a feature branch puts that branch in production.

**Creating the first user** is only possible from the CLI, deliberately. `POST
/auth/register` sits behind `requireAuth`, so there is no way to self-register over
HTTP. This is also how a forgotten password is reset:

```bash
cd server && npm run user:admin -- <username> <password> [--local]
```

## Architecture

### One Worker serves both the SPA and the API

This is the fact everything else follows from. `wrangler.jsonc` points Workers Assets
at `client/dist` and sets `run_worker_first: ["/api/*"]`, so the Worker only ever sees
API traffic; everything else is a static asset. Because client and API share an
origin there is no CORS middleware and the auth cookie stays `SameSite=Lax`.

`server/src/index.ts` mounts the whole app under `/api` on an outer Express app. The
prefix is load-bearing: client routes and API routes share names (`/products`,
`/invoices`, `/suppliers`), and without it a *navigation* to `/products` would return
`index.html` while a `fetch()` to the same path hit the API.

**The trap that costs the most time:** `not_found_handling` is
`single-page-application`, so a static path that does not resolve to a real file does
**not** 404. It returns `index.html` with `200 text/html`. A mistyped asset path, or
one the build did not emit, fails silently and looks like a content-type bug. Always
verify a new static file by its content type, not its status code. (This is why the
web manifest is `manifest.webmanifest` and not `manifest.json`: the extension is also
what earns `application/manifest+json` from the asset server, with no Worker route.)

Assets also take a minute or two to propagate after `wrangler deploy`. Curling
immediately can show HTML for files that uploaded fine. Re-check before concluding
anything is broken.

### Express on Workers, and what changes because of it

`httpServerHandler` from `cloudflare:node` bridges a real `http.Server` into the
Worker; `nodejs_compat` supplies `Buffer`, `node:crypto` and a `process.env`
populated from Wrangler vars and secrets.

Two module-scope rules, both of which fail only at runtime:

- **A `PrismaClient` per request, never a singleton.** D1 forbids I/O outside a
  request context, so a client built at module scope throws on first use. `index.ts`
  creates one per request and hands it over as `req.prisma` (see `lib/prisma.ts`).
- **Read secrets per call, not at module scope.** Bindings are populated for the
  request context, so a module-level `const` can evaluate before they exist. See
  `lib/jwtSecret.ts`, which also throws rather than falling back to a default -
  a deployment missing `JWT_SECRET` must fail loudly, not issue forgeable tokens.

There is no filesystem. Invoice images live in R2 (`INVOICES_BUCKET`), and
`Invoice.storedPath` holds an R2 object key.

Errors: throw `HttpError(message, status)` from `lib/httpError.ts` rather than
matching on message text downstream. `middleware/errors.ts` is mounted last and turns
everything into JSON, because Express's own handler returns an HTML stack trace that
the client parses as JSON and reports as a generic failure.

### The invoice pipeline

Upload to R2 -> Gemini reads the document -> a human reviews and corrects -> apply
writes `StockMovement` and `PriceHistory` rows.

Two separate things live on the `Invoice` row and are easy to conflate:

- `parsedJson` is the model's reading. Expensive (a paid Gemini call) and derived
  from a photo that can never change, so it is cached. `GET /invoices/:id/review` is
  the cheap read; only `POST /invoices/:id/parse` spends a call, and only when there
  is nothing cached or `?refresh=1`.
- `draftJson` is the reviewer's unfinished work, opaque to the server on purpose.

Invalidation runs one way only: a re-read clears the draft (its line positions no
longer refer to anything), never the reverse. `PARSE_CACHE_VERSION` in
`services/invoiceReview.ts` is bumped when the stored shape changes, which makes old
entries read as "nothing cached" - no migration needed.

`services/gemini.ts` holds a long Turkish-specific prompt. The number-format section
is not cosmetic: `invoiceApply` does `Math.round(unitPrice * 100)`, so a "1.234,56"
misread as 1.234 writes 123 kuruş instead of ₺1234.56 and nothing downstream notices.

### i18n

`i18n/locale.ts` imports nothing and must stay a leaf - `lib/format.ts` and
`i18n/index.ts` both depend on it, and that is what stops them forming a cycle. The
language resolves during module evaluation, before React renders, so the first paint
is already correct.

`index.html` ships a static `lang` and `<title>`; `applyDocumentLanguage()` in
`main.tsx` overwrites both before first paint. Do not "fix" those static values to
match one language.

`t()` is typed against the English dictionary and infers `{placeholders}` from the
copy string, so renaming a placeholder breaks every call site that fills it. Use
`raw()` only when the key is genuinely runtime-computed.

Server error strings are English-only prose. `services/api.ts` already prefers an
`error.code.*` dictionary entry when the server sends a `code`, so translating them
later is a server-side change with no screen edits.

### Client conventions

Tailwind v4 is configured **in CSS**, not `tailwind.config.js`: the palette lives in
`@theme` and shared helpers are `@utility` blocks in `src/index.css`.

The app is installed to iOS home screens, so fixed bars carry safe-area insets
(`env(safe-area-inset-*)`) and `viewport-fit=cover` is set. When adding or moving a
fixed top or bottom bar, account for the inset, and remember the bottom nav is
`4rem + inset` tall, not `4rem`.

## Stale files, do not trust

- `client/README.md` is unmodified Vite template boilerplate.
- `client/instructions.md` is a one-off prompt from an earlier phase. It describes a
  Node + SQLite backend and states "There is NO auth yet". Both are long false.
- `server/src/uploads/invoices/*.jpeg` are leftovers from before R2. Nothing reads
  them.
- `client/src/App.css` is scaffolding and is not imported anywhere.

## Deployment facts

`workers_dev: true`, no custom domain - `https://uup.keremg.workers.dev` is the only
way in. `preview_urls` is off on purpose: every preview would be a public hostname
wired to the same live D1 and R2. Placement is hinted to `aws:eu-central-1` so compute
sits beside the D1 primary, which was created `--location=weur` and cannot be moved.

Secrets are never in `wrangler.jsonc`. `JWT_SECRET` and `GEMINI_API_KEY` are set with
`wrangler secret put`; local development reads the same keys from `.dev.vars` beside
`wrangler.jsonc`. Production and local hold different `JWT_SECRET` values deliberately.
