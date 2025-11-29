export type RawGeminiInvoice = {
  supplier_name: string | null;
  issue_date: string | null;
  currency: string | null;
  line_items: Array<{
    line_no: number | null;
    code: string | null;
    description: string;
    barcode: string | null;
    quantity: number | null;
    unit: string | null;
    unit_price: number | null;
    total_price: number | null;
  }>;
};

export type ParsedInvoiceLine = {
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
};

export type ParsedInvoiceResponse = {
  invoiceId: number;
  supplierId: number;
  supplierName: string;
  supplierFromDocument: string | null;
  issueDate: string | null;
  currency: string | null;
  lines: ParsedInvoiceLine[];
};

export type ApplyInvoiceLineInput = {
  lineIndex: number;
  parsedLineNo: number | null;
  apply: boolean;
  productId: number | null;
  quantity: number | null;
  unitPrice: number | null;
  applyStock: boolean;
  applyPrice: boolean;
};

export type ApplyInvoiceRequest = {
  lines: ApplyInvoiceLineInput[];
};
