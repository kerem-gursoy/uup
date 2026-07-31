/**
 * The API is same-origin: one Worker serves both this app and the API, with the
 * API mounted under /api. In development Vite proxies /api to `wrangler dev`, so
 * a relative path is correct in both places and no cross-origin URL is needed.
 *
 * VITE_API_URL remains an escape hatch for pointing at another deployment.
 */
const API_BASE_URL = import.meta.env.VITE_API_URL || '/api';

export class ApiError extends Error {
    /** HTTP status, or 0 when the request never reached the server at all. */
    status: number;
    /**
     * The parsed error body, when there was one. Some failures carry useful
     * context - a name clash names the supplier already holding it - which the
     * UI can act on rather than only reporting.
     */
    body: Record<string, unknown> | null;

    constructor(status: number, message: string, body: Record<string, unknown> | null = null) {
        super(message);
        this.name = 'ApiError';
        this.status = status;
        this.body = body;
    }
}

/**
 * The server sends a plain-language `error` string; surfacing it beats a
 * generic "something went wrong" for users who need to know what to fix.
 */
export function errorMessage(err: unknown, fallback: string): string {
    return err instanceof ApiError && err.message ? err.message : fallback;
}

/** Fired when the server rejects us as unauthenticated, so the app can sign out. */
export const AUTH_EXPIRED_EVENT = 'uup:auth-expired';

async function fetchWithCredentials(url: string, options: RequestInit = {}) {
    try {
        return await fetch(url, {
            ...options,
            credentials: 'include',
        });
    } catch {
        // fetch only rejects when the request never completed: the API is down,
        // the address is wrong, or the browser blocked it as cross-origin.
        // Reported as status 0 so callers can tell it apart from a real reply.
        throw new ApiError(
            0,
            // Resolved against the page origin so the message names a real
            // address - API_BASE_URL is now a relative path and would read as
            // the unhelpful "cannot reach the server at /api".
            `Cannot reach the server at ${new URL(API_BASE_URL, window.location.origin).origin}. Check that it is running and reachable from this device.`
        );
    }
}

// ============================================================================
// TYPES
// ============================================================================

export interface Supplier {
    id: number;
    name: string;
    products?: Product[];
    /** Present on the list endpoint: how much is attached to this supplier. */
    productCount?: number;
    invoiceCount?: number;
}

/**
 * Every product carries two independent, dated price tracks:
 *   COST - what the shop pays its supplier
 *   SELL - what the shop charges its customer
 */
export type PriceKind = 'COST' | 'SELL';

export interface Product {
    id: number;
    name: string;
    brand: string | null;
    barcode: string | null;
    supplierId: number | null;
    supplier: Supplier | null;
    priceHistory?: PriceHistoryEntry[];
    stockMovements?: StockMovement[];
}

/** A product as it comes back from list-style endpoints, with its numbers. */
export interface ProductWithNumbers extends Product {
    currentStock: number;
    latestCost: PriceHistoryEntry | null;
    latestSell: PriceHistoryEntry | null;
}

export interface PriceHistoryEntry {
    id: number;
    productId: number;
    kind: PriceKind;
    priceCents: number;
    note: string | null;
    effectiveFrom: string;
}

export interface StockMovement {
    id: number;
    productId: number;
    quantity: number;
    reason: string;
    createdAt: string;
}

export interface ProductSummary {
    product: Product;
    latestCost: PriceHistoryEntry | null;
    latestSell: PriceHistoryEntry | null;
    currentStock: number;
    recentMovements: StockMovement[];
}

export interface ActivityEntry {
    id: string;
    type: 'STOCK' | 'PRICE';
    productId: number;
    productName: string;
    quantity: number | null;
    priceCents: number | null;
    priceKind: PriceKind | null;
    detail: string;
    at: string;
}

export interface UploadInvoiceResponse {
    invoiceId: number;
    supplier: {
        id: number;
        name: string;
    };
    file: {
        originalName: string;
        mimeType: string;
        storedPath: string;
    };
    status: string;
    createdAt: string;
}

export interface AdjustStockResponse {
    movement: StockMovement;
    currentStock: number;
}

// ============================================================================
// ERROR HANDLING
// ============================================================================

async function handleResponse<T>(response: Response): Promise<T> {
    if (!response.ok) {
        if (response.status === 401) {
            // Tell the app the session is gone so it can return to the sign-in
            // screen, rather than every page reporting its own odd failure.
            window.dispatchEvent(new Event(AUTH_EXPIRED_EVENT));
            throw new ApiError(401, 'Your session has ended. Please sign in again.');
        }

        const error = await response.json().catch(() => ({ error: response.statusText }));
        throw new ApiError(
            response.status,
            error.error || `Request failed: ${response.statusText}`,
            error
        );
    }
    return response.json();
}

// ============================================================================
// AUTH
// ============================================================================

export interface AuthUser {
    id: number;
    username: string;
}

export async function signIn(payload: { username: string; password: string }): Promise<AuthUser> {
    const response = await fetchWithCredentials(`${API_BASE_URL}/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
    });

    if (!response.ok) {
        const body = await response.json().catch(() => ({}));
        // A failed sign-in is not an expired session, so it must not trigger the
        // signed-out event that handleResponse would raise for a 401 here.
        throw new ApiError(response.status, body.error || 'Could not sign in.');
    }

    const data = (await response.json()) as { user: AuthUser };
    return data.user;
}

/**
 * Who is signed in, or null. A 401 is the expected answer for a visitor and is
 * reported as null rather than as an error.
 */
export async function getMe(): Promise<AuthUser | null> {
    const response = await fetchWithCredentials(`${API_BASE_URL}/auth/me`);
    if (!response.ok) return null;

    const data = (await response.json()) as { user: AuthUser };
    return data.user;
}

export async function signOut(): Promise<void> {
    await fetchWithCredentials(`${API_BASE_URL}/auth/logout`, { method: 'POST' });
}

// ============================================================================
// SUPPLIERS
// ============================================================================

export async function getSuppliers(): Promise<Supplier[]> {
    const response = await fetchWithCredentials(`${API_BASE_URL}/suppliers`);
    return handleResponse<Supplier[]>(response);
}

export async function getSupplier(id: number): Promise<Supplier> {
    const response = await fetchWithCredentials(`${API_BASE_URL}/suppliers/${id}`);
    return handleResponse<Supplier>(response);
}

/** What already exists for a proposed supplier name. Creates nothing. */
export interface SupplierNameCheck {
    valid: boolean;
    error?: string;
    /** The name exactly as it would be saved, after tidying whitespace. */
    normalizedName?: string;
    /** Set when a supplier already has this name, ignoring case and spacing. */
    exact: Supplier | null;
    /** Names matching once accents, case, spacing and punctuation are ignored. */
    similar: Supplier[];
}

export async function checkSupplierName(name: string): Promise<SupplierNameCheck> {
    const response = await fetchWithCredentials(
        `${API_BASE_URL}/suppliers/check?name=${encodeURIComponent(name)}`
    );
    return handleResponse<SupplierNameCheck>(response);
}

export async function createSupplier(payload: { name: string }): Promise<Supplier> {
    const response = await fetchWithCredentials(`${API_BASE_URL}/suppliers`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
    });
    return handleResponse<Supplier>(response);
}

export async function updateSupplier(id: number, payload: { name: string }): Promise<Supplier> {
    const response = await fetchWithCredentials(`${API_BASE_URL}/suppliers/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
    });
    return handleResponse<Supplier>(response);
}

export async function deleteSupplier(id: number): Promise<void> {
    const response = await fetchWithCredentials(`${API_BASE_URL}/suppliers/${id}`, {
        method: 'DELETE',
    });
    if (!response.ok) {
        const error = await response.json().catch(() => ({ error: response.statusText }));
        throw new ApiError(response.status, error.error || `Delete failed: ${response.statusText}`);
    }
}

// ============================================================================
// PRODUCTS
// ============================================================================

/**
 * Named subsets the home screen's attention list links to, so a count always
 * hands the user straight to exactly the products it referred to.
 */
export type ProductFilter = 'low' | 'no-price' | 'cost-rose' | 'below-cost';

export async function getProducts(params?: {
    search?: string;
    brand?: string;
    filter?: ProductFilter;
}): Promise<ProductWithNumbers[]> {
    const searchParams = new URLSearchParams();
    if (params?.search) searchParams.set('search', params.search);
    if (params?.brand) searchParams.set('brand', params.brand);
    if (params?.filter) searchParams.set('filter', params.filter);

    const url = `${API_BASE_URL}/products${searchParams.toString() ? `?${searchParams}` : ''}`;
    const response = await fetchWithCredentials(url);
    return handleResponse<ProductWithNumbers[]>(response);
}

export async function getProduct(id: number): Promise<Product> {
    const response = await fetchWithCredentials(`${API_BASE_URL}/products/${id}`);
    return handleResponse<Product>(response);
}

/**
 * Creates a product and, in the same call, records everything the shop already
 * knows about it: how many are on the shelf, what it costs, what it sells for.
 * All optional, so a product can also be added with nothing but a name.
 */
export async function createProduct(payload: {
    name: string;
    barcode?: string | null;
    brand?: string | null;
    supplierId?: number | null;
    quantity?: number | null;
    costCents?: number | null;
    sellCents?: number | null;
    effectiveFrom?: string | null;
}): Promise<ProductWithNumbers> {
    const response = await fetchWithCredentials(`${API_BASE_URL}/products`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
    });
    return handleResponse<ProductWithNumbers>(response);
}

export async function updateProduct(id: number, payload: {
    name: string;
    barcode?: string | null;
    brand?: string | null;
    supplierId?: number | null;
}): Promise<Product> {
    const response = await fetchWithCredentials(`${API_BASE_URL}/products/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
    });
    return handleResponse<Product>(response);
}

export async function deleteProduct(id: number): Promise<void> {
    const response = await fetchWithCredentials(`${API_BASE_URL}/products/${id}`, {
        method: 'DELETE',
    });
    if (!response.ok) {
        const error = await response.json().catch(() => ({ error: response.statusText }));
        throw new ApiError(response.status, error.error || `Delete failed: ${response.statusText}`);
    }
}

export async function getProductByBarcode(barcode: string): Promise<Product> {
    const response = await fetchWithCredentials(`${API_BASE_URL}/products/by-barcode/${encodeURIComponent(barcode)}`);
    return handleResponse<Product>(response);
}

// ============================================================================
// PRICE & INVENTORY
// ============================================================================

/**
 * Records a new dated price. Earlier entries are kept, so the shop can always
 * look back at what something used to cost.
 */
export async function setProductPrice(id: number, payload: {
    kind: PriceKind;
    priceCents: number;
    effectiveFrom?: string | null;
    note?: string | null;
}): Promise<PriceHistoryEntry> {
    const response = await fetchWithCredentials(`${API_BASE_URL}/products/${id}/set-price`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
    });
    return handleResponse<PriceHistoryEntry>(response);
}

/** Newest first. Omit `kind` to get both cost and selling price entries. */
export async function getPriceHistory(id: number, kind?: PriceKind): Promise<PriceHistoryEntry[]> {
    const query = kind ? `?kind=${kind}` : '';
    const response = await fetchWithCredentials(`${API_BASE_URL}/products/${id}/price-history${query}`);
    return handleResponse<PriceHistoryEntry[]>(response);
}

export async function adjustProductStock(id: number, payload: {
    quantity: number;
    reason: string;
}): Promise<AdjustStockResponse> {
    const response = await fetchWithCredentials(`${API_BASE_URL}/products/${id}/adjust-stock`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
    });
    return handleResponse<AdjustStockResponse>(response);
}

export async function getProductSummary(id: number): Promise<ProductSummary> {
    const response = await fetchWithCredentials(`${API_BASE_URL}/products/${id}/summary`);
    return handleResponse<ProductSummary>(response);
}

// ============================================================================
// REPORTS
// ============================================================================

/**
 * What needs attention, as counts. This is what the home screen opens with, so
 * it answers one question: what should someone deal with today?
 */
export interface AttentionReport {
    /** Products at or below the low-stock threshold, including those at zero. */
    lowStock: number;
    outOfStock: number;
    invoicesToReview: number;
    missingSellPrice: number;
    /** Cost has changed since the selling price was last decided. */
    costRoseSincePriceSet: number;
    /** Priced at or below cost - money lost on every sale. */
    sellingBelowCost: number;
    lowStockThreshold: number;
}

export async function getAttention(): Promise<AttentionReport> {
    const response = await fetchWithCredentials(`${API_BASE_URL}/reports/attention`);
    return handleResponse<AttentionReport>(response);
}

export async function getRecentActivity(): Promise<ActivityEntry[]> {
    const response = await fetchWithCredentials(`${API_BASE_URL}/reports/recent-activity`);
    return handleResponse<ActivityEntry[]>(response);
}

export async function checkBackend(): Promise<{ message: string }> {
    const response = await fetchWithCredentials(`${API_BASE_URL}/`);
    return handleResponse<{ message: string }>(response);
}

// ============================================================================
// INVOICES
// ============================================================================

export interface InvoiceSummary {
    id: number;
    supplier: { id: number; name: string };
    originalName: string;
    mimeType: string;
    status: string;
    createdAt: string;
}

/** Newest first. Anything not yet APPLIED is still waiting to be reviewed. */
export async function getInvoices(): Promise<InvoiceSummary[]> {
    const response = await fetchWithCredentials(`${API_BASE_URL}/invoices`);
    return handleResponse<InvoiceSummary[]>(response);
}

export async function uploadInvoice(formData: FormData): Promise<UploadInvoiceResponse> {
    const response = await fetchWithCredentials(`${API_BASE_URL}/invoices/upload`, {
        method: 'POST',
        body: formData,
    });
    return handleResponse<UploadInvoiceResponse>(response);
}

// ============================================================================
// INVOICE PARSING & APPLYING
// ============================================================================

export interface ParsedInvoiceLine {
    lineNo: number | null;
    code: string | null;
    description: string;
    barcode: string | null;
    quantity: number | null;
    unit: string | null;
    unitPrice: number | null;
    totalPrice: number | null;
    matchedProductId: number | null;
    matchedProductName: string | null;
    matchedBrand: string | null;
    matchScore: number;
}

export interface ParsedInvoiceResponse {
    invoiceId: number;
    supplierId: number;
    supplierName: string;
    supplierFromDocument: string | null;
    issueDate: string | null;
    currency: string | null;
    lines: ParsedInvoiceLine[];
}

export interface ApplyInvoiceLineInput {
    lineIndex: number;
    parsedLineNo: number | null;
    apply: boolean;
    productId: number | null;
    quantity: number | null;
    unitPrice: number | null;
    applyStock: boolean;
    applyPrice: boolean;
}

export interface ApplyInvoiceRequest {
    lines: ApplyInvoiceLineInput[];
}

export interface ApplyResult {
    invoiceId: number;
    appliedLines: number;
    skippedLines: number;
}

export async function parseInvoice(id: number): Promise<ParsedInvoiceResponse> {
    const response = await fetchWithCredentials(`${API_BASE_URL}/invoices/${id}/parse`, {
        method: 'POST',
    });
    return handleResponse<ParsedInvoiceResponse>(response);
}

export async function applyInvoice(id: number, payload: ApplyInvoiceRequest): Promise<ApplyResult> {
    const response = await fetchWithCredentials(`${API_BASE_URL}/invoices/${id}/apply`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
    });
    return handleResponse<ApplyResult>(response);
}
