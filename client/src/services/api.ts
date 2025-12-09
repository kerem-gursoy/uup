// API base URL - adjust as needed
const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:3000';

async function fetchWithCredentials(url: string, options: RequestInit = {}) {
    return fetch(url, {
        ...options,
        credentials: 'include',
    });
}

// ============================================================================
// TYPES
// ============================================================================

export interface Supplier {
    id: number;
    name: string;
    products?: Product[];
}

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

export interface PriceHistoryEntry {
    id: number;
    productId: number;
    priceCents: number;
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
    latestPrice: PriceHistoryEntry | null;
    currentStock: number;
}

export interface LowStockProduct extends Product {
    currentStock: number;
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

class ApiError extends Error {
    status: number;

    constructor(status: number, message: string) {
        super(message);
        this.name = 'ApiError';
        this.status = status;
    }
}

async function handleResponse<T>(response: Response): Promise<T> {
    if (!response.ok) {
        const error = await response.json().catch(() => ({ error: response.statusText }));
        throw new ApiError(response.status, error.error || `Request failed: ${response.statusText}`);
    }
    return response.json();
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

export async function getProducts(params?: { search?: string; brand?: string }): Promise<Product[]> {
    const searchParams = new URLSearchParams();
    if (params?.search) searchParams.set('search', params.search);
    if (params?.brand) searchParams.set('brand', params.brand);

    const url = `${API_BASE_URL}/products${searchParams.toString() ? `?${searchParams}` : ''}`;
    const response = await fetchWithCredentials(url);
    return handleResponse<Product[]>(response);
}

export async function getProduct(id: number): Promise<Product> {
    const response = await fetchWithCredentials(`${API_BASE_URL}/products/${id}`);
    return handleResponse<Product>(response);
}

export async function createProduct(payload: {
    name: string;
    barcode?: string | null;
    brand?: string | null;
    supplierId?: number | null;
}): Promise<Product> {
    const response = await fetchWithCredentials(`${API_BASE_URL}/products`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
    });
    return handleResponse<Product>(response);
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

export async function setProductPrice(id: number, priceCents: number): Promise<PriceHistoryEntry> {
    const response = await fetchWithCredentials(`${API_BASE_URL}/products/${id}/set-price`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ priceCents }),
    });
    return handleResponse<PriceHistoryEntry>(response);
}

export async function getPriceHistory(id: number): Promise<PriceHistoryEntry[]> {
    const response = await fetchWithCredentials(`${API_BASE_URL}/products/${id}/price-history`);
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

export async function getLowStock(threshold: number = 5): Promise<LowStockProduct[]> {
    const response = await fetchWithCredentials(`${API_BASE_URL}/reports/low-stock?threshold=${threshold}`);
    return handleResponse<LowStockProduct[]>(response);
}

// ============================================================================
// INVOICES
// ============================================================================

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

// ============================================================================
// LEGACY EXPORTS (for backward compatibility)
// ============================================================================

export const fetchSuppliers = getSuppliers;
