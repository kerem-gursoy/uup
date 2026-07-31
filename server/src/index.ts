import express from "express";
import cookieParser from "cookie-parser";
import { createServer } from "node:http";
import { httpServerHandler } from "cloudflare:node";
import { getPrisma } from "./lib/prisma.js";
import { check } from "./controllers/system.js";
import { login, logout, me, register } from "./controllers/auth.js";
import { requireAuth } from "./middleware/auth.js";
import { errorHandler } from "./middleware/errors.js";
import {
  checkSupplierName,
  createSupplier,
  deleteSupplier,
  getSupplier,
  listSuppliers,
  updateSupplier,
} from "./controllers/suppliers.js";
import {
  adjustStock,
  createProduct,
  deleteProduct,
  getPriceHistory,
  getProduct,
  getProductByBarcode,
  getProductSummary,
  listProducts,
  setProductPrice,
  updateProduct,
} from "./controllers/products.js";
import { getAttention, getRecentActivity } from "./controllers/reports.js";
import {
  invoiceUpload,
  uploadInvoice,
  listInvoices,
  getInvoice,
  parseInvoice,
  applyParsedInvoice,
} from "./controllers/invoices.js";


const app = express();

// No CORS middleware: one Worker serves both the SPA and this API, so they are
// the same origin. In development Vite proxies /api to `wrangler dev`, which is
// same-origin too. If a second origin is ever introduced, CORS has to come back.
app.use(express.json());
app.use(cookieParser());

// A PrismaClient per request. D1 forbids I/O outside a request context, so this
// cannot be a module-level singleton - see lib/prisma.ts.
app.use((req, _res, next) => {
  req.prisma = getPrisma();
  next();
});

app.get("/", check);

// Auth Routes
app.post("/auth/login", login);
app.post("/auth/logout", logout);
app.get("/auth/me", me);

// Protected Routes
app.use(requireAuth);

/*
 * Deliberately behind requireAuth. The client has no sign-up screen, so as a
 * public route this was only ever a way for a stranger who found the URL to
 * grant themselves full access to the shop's inventory. Behind the gate, an
 * existing user can add a colleague.
 *
 * That leaves no way to create the FIRST user over HTTP, which is the point:
 * bootstrap with `npm run user:admin -- <username> <password>`, which writes to
 * D1 through Wrangler and is also how a forgotten password gets reset.
 */
app.post("/auth/register", register);

app.post("/suppliers", createSupplier);
app.get("/suppliers", listSuppliers);
// Declared before "/suppliers/:id" so "check" is never read as an id.
app.get("/suppliers/check", checkSupplierName);
app.get("/suppliers/:id", getSupplier);
app.put("/suppliers/:id", updateSupplier);
app.delete("/suppliers/:id", deleteSupplier);

app.post("/products", createProduct);
app.get("/products", listProducts);
app.get("/products/by-barcode/:barcode", getProductByBarcode);
app.get("/products/:id", getProduct);
app.put("/products/:id", updateProduct);
app.delete("/products/:id", deleteProduct);

app.post("/products/:id/set-price", setProductPrice);
app.get("/products/:id/price-history", getPriceHistory);
app.post("/products/:id/adjust-stock", adjustStock);
app.get("/products/:id/summary", getProductSummary);

app.get("/reports/attention", getAttention);
app.get("/reports/recent-activity", getRecentActivity);

app.post("/invoices/upload", invoiceUpload.single("file"), uploadInvoice);
app.get("/invoices", listInvoices);
app.get("/invoices/:id", getInvoice);
app.post("/invoices/:id/parse", parseInvoice);
app.post("/invoices/:id/apply", applyParsedInvoice);

// Last, so it sees anything the routes above throw - including multer's
// file-size rejection, which Express would otherwise answer with an HTML stack
// trace the client cannot read.
app.use(errorHandler);

/**
 * Everything above is mounted under /api on an outer app, so no route string in
 * this file had to change.
 *
 * The prefix is not cosmetic. Cloudflare serves static assets before invoking
 * the Worker, and this app's client routes share names with its API routes
 * (/products, /suppliers, /invoices). Without a prefix, a *navigation* to
 * /products would be answered with index.html while a fetch() to the same path
 * reached the API - a difference that depends on a request header and would be
 * miserable to debug. `run_worker_first: ["/api/*"]` in wrangler.jsonc pins the
 * API side of that split explicitly.
 */
const root = express();
root.use("/api", app);

/*
 * The cast bridges a declaration gap, not a real incompatibility: Cloudflare
 * types `NodeStyleServer.address()` as `{ port?: number | null }` while
 * @types/node types `http.Server.address()` as `string | AddressInfo | null`.
 * Passing a real `http.Server` here is Cloudflare's own documented pattern.
 */
export default httpServerHandler(
  createServer(root) as unknown as Parameters<typeof httpServerHandler>[0]
);
