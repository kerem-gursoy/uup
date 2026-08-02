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
  /**
   * True when quantity × unitPrice does not agree with the row total printed on
   * the invoice. Almost always a misread decimal separator - Turkish invoices
   * write "1.234,56" - and it is worth catching here, because applying the line
   * writes the price into cost history where nothing would flag it later.
   */
  priceMismatch: boolean;
};

/**
 * The half of a reading that comes from the document itself, and so is worth
 * storing: re-reading the same photo can only produce the same answer.
 *
 * The supplier's id and name are deliberately NOT in here even though the
 * response carries them. They come from the Supplier row, and caching them would
 * mean a supplier renamed after the invoice was read still showed its old name
 * on the review screen.
 */
export type CachedInvoiceParse = {
  supplierFromDocument: string | null;
  issueDate: string | null;
  currency: string | null;
  lines: ParsedInvoiceLine[];
};

export type ParsedInvoiceResponse = CachedInvoiceParse & {
  invoiceId: number;
  supplierId: number;
  supplierName: string;
  /** When this reading was taken. Identifies it, so a draft saved against an
   *  older reading can be recognised and refused - see invoiceReview.ts. */
  parsedAt: string;
};

/** The review screen's unfinished work, as handed back to it. */
export type InvoiceDraft = {
  lines: unknown[];
  updatedAt: string;
};

/** Everything the review screen needs to open without doing any paid work. */
export type InvoiceReviewState = {
  parsed: ParsedInvoiceResponse | null;
  draft: InvoiceDraft | null;
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
