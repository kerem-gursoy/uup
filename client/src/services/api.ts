/**
 * The API is same-origin: one Worker serves both this app and the API, with the
 * API mounted under /api. In development Vite proxies /api to `wrangler dev`, so
 * a relative path is correct in both places and no cross-origin URL is needed.
 *
 * VITE_API_URL remains an escape hatch for pointing at another deployment.
 */
import { hasKey, raw, t } from '../i18n';

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

    /**
     * A stable machine-readable code, when the server sends one alongside the
     * message. Nothing sets this today - the server speaks only English prose -
     * but see errorMessage below for why it is read for anyway.
     */
    get code(): string | null {
        const code = this.body?.code;
        return typeof code === 'string' ? code : null;
    }
}

/**
 * The server sends a plain-language `error` string; surfacing it beats a
 * generic "something went wrong" for users who need to know what to fix.
 *
 * Those strings are English-only, so a Turkish user still meets English here.
 * Translating them is a server change, and this is the client half of it done in
 * advance: if the server ever starts sending `{ error, code }`, a matching
 * `error.code.*` entry in the dictionary wins over the English prose, and no
 * screen has to change. Until then the branch is simply never taken.
 */
export function errorMessage(err: unknown, fallback: string): string {
    if (!(err instanceof ApiError)) return fallback;

    // raw() rather than t(): the key is only known at runtime, and t()'s argument
    // checking works off a literal key. Error copy takes no placeholders anyway.
    const key = `error.code.${err.code}`;
    if (err.code && hasKey(key)) return raw(key);

    return err.message || fallback;
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
            t('error.unreachable', {
                origin: new URL(API_BASE_URL, window.location.origin).origin,
            })
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

async function throwIfFailed(response: Response): Promise<void> {
    if (response.ok) return;

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

async function handleResponse<T>(response: Response): Promise<T> {
    await throwIfFailed(response);
    return response.json();
}

/**
 * For replies that carry no body - a 204 from a delete. Separate from
 * handleResponse only because response.json() would throw on an empty body;
 * failures are read exactly the same way, which is the point. Doing it by hand
 * at the call site is what used to lose the 401 event, so a delete attempted
 * with an expired session reported a puzzle instead of returning to sign-in.
 */
async function handleEmptyResponse(response: Response): Promise<void> {
    await throwIfFailed(response);
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
    return handleEmptyResponse(response);
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
    return handleEmptyResponse(response);
}

export async function getProductByBarcode(barcode: string): Promise<Product> {
    const response = await fetchWithCredentials(`${API_BASE_URL}/products/by-barcode/${encodeURIComponent(barcode)}`);
    return handleResponse<Product>(response);
}

/** A product that already looks like the one being typed. Creates nothing. */
export interface SimilarProduct {
    id: number;
    name: string;
    brand: string | null;
    barcode: string | null;
}

export interface ProductNameCheck {
    valid: boolean;
    /** The name exactly as it would be saved, after tidying whitespace. */
    normalizedName: string;
    /** Existing products matching once case, accents and punctuation are ignored. */
    similar: SimilarProduct[];
}

/**
 * Reports what already looks like this product, so a near-duplicate can be
 * headed off while it is being typed rather than discovered months later as two
 * half-complete stock histories.
 */
export async function checkProductName(
    name: string,
    options?: { excludeId?: number }
): Promise<ProductNameCheck> {
    const params = new URLSearchParams({ name });
    if (options?.excludeId !== undefined) {
        params.set('excludeId', String(options.excludeId));
    }

    const response = await fetchWithCredentials(`${API_BASE_URL}/products/check?${params}`);
    return handleResponse<ProductNameCheck>(response);
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
    /** When somebody last worked on this review and stopped, if they did. */
    startedAt: string | null;
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

/**
 * Which rule identified the product on a line.
 *
 * There is no score alongside this and no "maybe" among the values, because the
 * server only ever reports an exact, human-established identity - a barcode, or
 * a mapping somebody confirmed by applying an earlier invoice. Anything less
 * certain comes back with no product at all.
 */
export type MatchEvidence = 'barcode' | 'supplierCode' | 'supplierDescription';

/** Why the server declined to match a line despite having found something. */
export type MatchRefusal = 'conflict';

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
    matchedBy: MatchEvidence | null;
    /** Evidence was found but refused - today, two rules naming different products. */
    matchRefusedBecause: MatchRefusal | null;
    /** Quantity × unit price does not match the row total printed on the invoice,
     *  usually a misread decimal separator. Worth showing before it is applied. */
    priceMismatch: boolean;
}

/** The invoice's own totals, as printed on the document. */
export interface DocumentTotals {
    subtotal: number | null;
    vatTotal: number | null;
    grandTotal: number | null;
}

/**
 * Whether the lines that were read account for the total printed on the invoice.
 *
 * The only check that can catch a line the reading missed entirely - every other
 * check validates a row against itself, and a dropped row leaves no row behind.
 */
export interface TotalsCheck {
    status: 'agrees' | 'disagrees' | 'unknown';
    linesTotal: number;
    documentTotal: number | null;
    /** documentTotal − linesTotal. Positive means the lines are short. */
    difference: number | null;
    linesMissingTotal: number;
}

export interface ParsedInvoiceResponse {
    invoiceId: number;
    supplierId: number;
    supplierName: string;
    supplierFromDocument: string | null;
    issueDate: string | null;
    currency: string | null;
    totals: DocumentTotals;
    totalsCheck: TotalsCheck;
    /**
     * When this reading was taken. Identifies it: a draft is saved against the
     * reading it was made from, so one written before a re-read can be told
     * apart and refused rather than re-applied to lines that have moved.
     */
    parsedAt: string;
    lines: ParsedInvoiceLine[];
}

/**
 * The review screen's unfinished work, as the server stored it.
 *
 * `lines` is unknown[] rather than the screen's own line type, and deliberately
 * so. This is data that outlives the code that wrote it - a draft saved before a
 * deploy is read back after one - so the screen validates it on the way in
 * instead of the type system asserting a shape nobody checked.
 */
export interface InvoiceDraft {
    lines: unknown[];
    updatedAt: string;
}

/** Everything the review screen needs to open. Both halves may be absent. */
export interface InvoiceReviewState {
    /** null only when this invoice has never been read. */
    parsed: ParsedInvoiceResponse | null;
    draft: InvoiceDraft | null;
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
    /**
     * What the document called this line. Sent back so applying can remember
     * what the reviewer decided it meant, which is what stops the next invoice
     * from this supplier asking the same question again.
     */
    code?: string | null;
    description?: string | null;
}

export interface ApplyInvoiceRequest {
    lines: ApplyInvoiceLineInput[];
}

export interface ApplyResult {
    invoiceId: number;
    appliedLines: number;
    skippedLines: number;
}

/**
 * Opens an invoice for review without spending anything: the stored reading and
 * whatever review was left unfinished against it.
 *
 * `parsed` comes back null only for an invoice nobody has read yet - that is the
 * one case where the screen has to call parseInvoice and wait.
 */
export async function getInvoiceReview(id: number): Promise<InvoiceReviewState> {
    const response = await fetchWithCredentials(`${API_BASE_URL}/invoices/${id}/review`);
    return handleResponse<InvoiceReviewState>(response);
}

/**
 * Reads the invoice photo, or hands back the reading already stored for it.
 *
 * `refresh` forces a fresh reading, discarding both the stored one and any draft
 * made against it. That is the expensive path - a multi-second model call the
 * shop pays for - so it belongs to an explicit "read it again", never to a page
 * load.
 */
export async function parseInvoice(
    id: number,
    { refresh = false }: { refresh?: boolean } = {}
): Promise<ParsedInvoiceResponse> {
    const query = refresh ? '?refresh=1' : '';
    const response = await fetchWithCredentials(
        `${API_BASE_URL}/invoices/${id}/parse${query}`,
        { method: 'POST' }
    );
    return handleResponse<ParsedInvoiceResponse>(response);
}

/**
 * Stores the unfinished review.
 *
 * `keepalive` is for the save fired as the app goes into the background, which
 * is the whole reason any of this exists: it lets the request outlive the page
 * that started it, so switching apps mid-invoice does not lose the last edit.
 * Browsers cap keepalive bodies at 64KB, which a few hundred invoice lines sit
 * comfortably under.
 */
export async function saveInvoiceDraft(
    id: number,
    draft: { parsedAt: string; lines: unknown[] },
    { keepalive = false }: { keepalive?: boolean } = {}
): Promise<InvoiceDraft> {
    const response = await fetchWithCredentials(`${API_BASE_URL}/invoices/${id}/draft`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(draft),
        keepalive,
    });
    return handleResponse<InvoiceDraft>(response);
}

/** Throws the unfinished review away, keeping the reading it was made against. */
export async function discardInvoiceDraft(id: number): Promise<void> {
    const response = await fetchWithCredentials(`${API_BASE_URL}/invoices/${id}/draft`, {
        method: 'DELETE',
    });
    return handleEmptyResponse(response);
}

export async function applyInvoice(id: number, payload: ApplyInvoiceRequest): Promise<ApplyResult> {
    const response = await fetchWithCredentials(`${API_BASE_URL}/invoices/${id}/apply`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
    });
    return handleResponse<ApplyResult>(response);
}
