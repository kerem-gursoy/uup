You are helping me finish a React + TypeScript + Vite + Tailwind PWA that I’ve already scaffolded with mock data.

The app is an internal inventory/POS-style tool. Right now:
- Routing, layout, and pages exist.
- All data is mock / in-memory.
- I now have a real backend and want to:
  - Replace EVERY mock data source with live API calls.
  - Centralize API logic in a small client layer.
  - Add loading/error states.
  - Remove any unused mock data and stubs.

Please read the backend contract carefully and then generate the frontend changes.

========================
BACKEND OVERVIEW (DO NOT MODIFY)
========================

Backend stack: Node + Express + TypeScript + Prisma + SQLite.

Key models:

- Supplier:
  - id: number
  - name: string

- Product:
  - id: number
  - name: string
  - brand: string | null
  - barcode: string | null
  - supplierId: number | null
  - supplier: Supplier | null

- PriceHistory:
  - id: number
  - productId: number
  - priceCents: number
  - effectiveFrom: Date

- StockMovement:
  - id: number
  - productId: number
  - quantity: number (positive or negative)
  - reason: string
  - createdAt: Date

- Invoice:
  - id: number
  - supplierId: number
  - originalName: string
  - storedPath: string
  - mimeType: string
  - status: string ("UPLOADED" for now)
  - createdAt: Date

There is NO auth yet; everything is open for now.

------------------------
API ENDPOINTS (CURRENT)
------------------------

### System
- GET `/`
  - Returns `{ message: "Backend running" }`

### Suppliers
- GET `/suppliers`
  - Returns ordered list of suppliers (id, name).

- GET `/suppliers/:id`
  - Returns supplier with its products.

- POST `/suppliers`
  - Body: `{ name: string }`
  - Creates supplier.

- PUT `/suppliers/:id`
  - Body: `{ name: string }`
  - Updates supplier.

- DELETE `/suppliers/:id`
  - Deletes supplier (may fail if in use).

### Products

- GET `/products`
  - Query params:
    - `search` (optional): filters by name, barcode, OR brand (case-insensitive contains).
    - `brand` (optional): exact brand filter.
  - Returns products including `supplier`.

- GET `/products/:id`
  - Returns product including:
    - `supplier`
    - latest `priceHistory` entries
    - latest `stockMovements`

- POST `/products`
  - Body: `{ name: string; barcode?: string | null; brand?: string | null; supplierId?: number | null }`
  - Creates product.

- PUT `/products/:id`
  - Same body shape as POST, updates product.

- DELETE `/products/:id`
  - Deletes product.

- GET `/products/by-barcode/:barcode`
  - Returns a single product matched by barcode or 404.

### Price / Inventory

- POST `/products/:id/set-price`
  - Body: `{ priceCents: number }` (positive integer).
  - Inserts into `PriceHistory` and returns the new entry.

- GET `/products/:id/price-history`
  - Returns all price history rows ordered by `effectiveFrom ASC`.

- POST `/products/:id/adjust-stock`
  - Body: `{ quantity: number; reason: string }`
    - `quantity` can be positive or negative, but not zero.
  - Creates `StockMovement` row.
  - Returns `{ movement, currentStock }` where `currentStock` is aggregate sum.

- GET `/products/:id/summary`
  - Returns:
    ```json
    {
      "product": { ... },
      "latestPrice": PriceHistory | null,
      "currentStock": number
    }
    ```

### Reports

- GET `/reports/low-stock`
  - Query param:
    - `threshold` (optional, number, default 5).
  - Aggregates stock movements and returns list of products whose current stock <= threshold, each with a `currentStock` field.

### Invoices

- POST `/invoices/upload`
  - Content-Type: multipart/form-data
  - Fields:
    - `supplierId`: required
    - `file`: required (field name `"file"`, invoice image)
  - Responses:
    - 201 Created:
      ```json
      {
        "invoiceId": number,
        "supplier": { "id": number, "name": string },
        "file": {
          "originalName": string,
          "mimeType": string,
          "storedPath": string
        },
        "status": "UPLOADED",
        "createdAt": "2025-11-26T12:34:56.000Z"
      }
      ```
    - 400 for missing/invalid supplierId or missing file
    - 404 if supplier not found

NOTE: There is not yet any `/invoices/parse` or `/invoices/apply` endpoint; right now we only upload and register invoices.

========================
CURRENT FRONTEND STATE
========================

Key pages/routes (already set up):

- `/login` (simple mock login)
- `/` (home/dashboard)
- `/products` (product list)
- `/products/:id` (product detail)
- `/scan` (barcode scan UX, currently simulated)
- `/invoices/upload` (invoice upload stub, may already have basic supplier selection)
- `/settings` (about/settings stub)

I want to keep the overall UI and UX, but:

- **Remove all mock data.**
- **Replace every read/write with real API calls**.
- Add minimal but solid:
  - Loading states
  - Error handling (toasts or inline messages)
  - Basic retry where appropriate

========================
WHAT I WANT YOU TO DO
========================

1. Create a small, typed API client layer in the frontend, e.g. `src/api.ts`:
   - Base URL assume is the same origin for now (or configurable).
   - Functions (returning typed promises) for:
     - `getSuppliers()`
     - `getSupplier(id)`
     - `createSupplier(payload)`
     - `updateSupplier(id, payload)`
     - `deleteSupplier(id)`
     - `getProducts(params?: { search?: string; brand?: string })`
     - `getProduct(id)`
     - `createProduct(payload)`
     - `updateProduct(id, payload)`
     - `deleteProduct(id)`
     - `getProductSummary(id)` (calls `/products/:id/summary`)
     - `setProductPrice(id, priceCents)`
     - `adjustProductStock(id, { quantity, reason })`
     - `getPriceHistory(id)`
     - `getLowStock(threshold?: number)`
     - `getProductByBarcode(barcode)`
     - `uploadInvoice(formData)` (for `/invoices/upload`)
   - Use `fetch` with proper error handling.
   - Throw typed errors or return a result object that includes `ok`, `data`, `error`.

2. Define TypeScript types/interfaces on the frontend that mirror the API:
   - Supplier, Product, ProductSummary, PriceHistoryEntry, StockMovement, LowStockProduct, InvoiceUploadResponse, etc.
   - Keep them consistent with the backend shapes described above.

3. For each page, replace mock data with real API usage:

   **Home (`/`):**
   - Use:
     - `getLowStock()` to show low stock preview.
     - `getProducts({ search })` for quick search (or navigate to `/products` with params).
   - Implement loading and error states.

   **Products list (`/products`):**
   - Use `getProducts({ search, brand })`.
   - Implement:
     - Search input that debounces calls.
     - Optional brand filter (uses product.brand values you get back).
   - Remove any mock arrays.

   **Product detail (`/products/:id`):**
   - Use `getProductSummary(id)` to show product, current price, and current stock.
   - Use `getPriceHistory(id)` for history section.
   - Hook:
     - “Set price” modal → calls `setProductPrice(id, priceCents)`, then refreshes summary/history.
     - “Adjust stock” modal → calls `adjustProductStock(id, { quantity, reason })`, then refreshes summary.
   - Remove all local fake updates; rely on API + re-fetch.

   **Barcode scan (`/scan`):**
   - For now, still use simulated camera UX, BUT:
     - When the user submits a barcode (either via simulated scan or manual input), call `getProductByBarcode(barcode)` and navigate to that product detail route if found.
     - Handle 404 by showing a “No product with that barcode” message.

   **Suppliers (if there is a suppliers page or selector):**
   - Anywhere a supplier dropdown exists, populate it via `getSuppliers()`.
   - For create/edit supplier flows, call `createSupplier` / `updateSupplier`.

   **Invoice upload (`/invoices/upload`):**
   - Supplier must be selected first (via `getSuppliers()`).
   - Implement real upload:
     - Use `<input type="file">` and FormData.
     - Call `uploadInvoice(formData)` with `supplierId` and `file`.
   - Show success card with:
     - Supplier name
     - File name
     - Status
     - Created at (formatted)
   - Keep this page ready for future “parse/apply” flows, but do not invent endpoints.

   **Settings (`/settings`):**
   - You can keep this mostly static but:
     - Optionally show a health check by calling `GET /` and displaying the backend version message or connection status.

4. Globally:
   - Introduce a simple toast/notification system and use it for:
     - Success and error messages (e.g., after stock adjust, price set, invoice upload).
   - Ensure every API call has:
     - Loading UI (spinner/skeleton).
     - Error state with retry or “Back” button.

5. Clean up:
   - Remove all mock data imports and hard-coded arrays.
   - Remove any “fake success” code; all mutations should go through API client.
   - Ensure TypeScript passes (no `any` unless absolutely necessary).

6. Output format:
   - Provide:
     - The `api.ts` client file.
     - Updated versions of key page components (`Home`, `ProductsList`, `ProductDetail`, `Scan`, `InvoiceUpload`, any Suppliers page).
     - Any supporting hooks (e.g., `useProducts`, `useProductSummary`, `useSuppliers`) if you deem them useful.
   - Keep code cohesive but not over-engineered; this is an internal tool, not a huge SaaS.
   - Use idiomatic React with function components and hooks, no class components.

