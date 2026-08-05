import type { MatchEvidence, MatchRefusal } from "./productMatching.js";

export type RawGeminiInvoice = {
  supplier_name: string | null;
  issue_date: string | null;
  currency: string | null;
  subtotal: number | null;
  vat_total: number | null;
  grand_total: number | null;
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

/**
 * One line as the document itself states it, and nothing else.
 *
 * Everything here is a property of a photograph that cannot change, which is
 * exactly what makes it safe to cache - see CachedInvoiceParse below.
 */
export type DocumentLine = {
  lineNo: number | null;
  code: string | null;
  description: string;
  barcode: string | null;
  quantity: number | null;
  unit: string | null;
  unitPrice: number | null;
  totalPrice: number | null;
  /**
   * True when quantity × unitPrice does not agree with the row total printed on
   * the invoice. Almost always a misread decimal separator - Turkish invoices
   * write "1.234,56" - and it is worth catching here, because applying the line
   * writes the price into cost history where nothing would flag it later.
   */
  priceMismatch: boolean;
};

/**
 * A line as the review screen receives it: what the document said, plus who we
 * think it refers to.
 *
 * The match half is deliberately NOT part of the cached reading. It is derived
 * from the product catalogue and from what previous invoices taught us, both of
 * which change between one visit to this screen and the next - so it is computed
 * on every read. A product created five minutes ago therefore matches
 * immediately, where a cached match would have gone on saying "no product" until
 * somebody paid for a re-read.
 *
 * This is the same rule the supplier name already follows, and for the same
 * reason: cache the document, resolve everything else live.
 */
export type ParsedInvoiceLine = DocumentLine & {
  matchedProductId: number | null;
  matchedProductName: string | null;
  matchedBrand: string | null;
  /**
   * Which rule identified the product, for the review screen to show as the
   * reason. Null whenever matchedProductId is null.
   *
   * There is no score here on purpose. Matching either finds an exact,
   * human-established identity or finds nothing - see services/productMatching.ts
   * for why a middle ground was rejected.
   */
  matchedBy: MatchEvidence | null;
  /**
   * Set when evidence existed but was refused - today only when two rules named
   * different products. Distinct from "nothing was found", because it is worth
   * telling the reviewer that the app looked and found a contradiction.
   */
  matchRefusedBecause: MatchRefusal | null;
};

/** The document's own totals, as printed on it. */
export type DocumentTotals = {
  subtotal: number | null;
  vatTotal: number | null;
  grandTotal: number | null;
};

/**
 * The half of a reading that comes from the document itself, and so is worth
 * storing: re-reading the same photo can only produce the same answer.
 *
 * The supplier's id and name are deliberately NOT in here even though the
 * response carries them, and neither are product matches. Both come from rows
 * that can change after the reading was taken.
 */
export type CachedInvoiceParse = {
  supplierFromDocument: string | null;
  issueDate: string | null;
  currency: string | null;
  totals: DocumentTotals;
  lines: DocumentLine[];
  /** What the reading cost, when the model reported it. Recorded, never acted on. */
  usage: ParseUsage | null;
};

/** Token counts for one Gemini call, as reported by the model. */
export type ParseUsage = {
  promptTokens: number | null;
  outputTokens: number | null;
  /** Billed at the output rate, and the reason a reading can cost more than it looks. */
  thoughtsTokens: number | null;
  totalTokens: number | null;
};

/**
 * Whether the lines that were read account for the total printed on the invoice.
 *
 * This is the only check in the pipeline that can catch a line the model missed
 * altogether. Every other check is per-row, and a row that was never returned
 * has no row to check.
 */
export type TotalsCheck = {
  status: "agrees" | "disagrees" | "unknown";
  /** The sum of the line totals that were read. */
  linesTotal: number;
  /** What the document says its goods should come to, excluding VAT. */
  documentTotal: number | null;
  /** documentTotal − linesTotal, when both are known. Positive means lines are short. */
  difference: number | null;
  /** Lines whose own total was not read, which is why status can be "unknown". */
  linesMissingTotal: number;
};

export type ParsedInvoiceResponse = {
  invoiceId: number;
  supplierId: number;
  supplierName: string;
  supplierFromDocument: string | null;
  issueDate: string | null;
  currency: string | null;
  totals: DocumentTotals;
  totalsCheck: TotalsCheck;
  lines: ParsedInvoiceLine[];
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
  /**
   * What the document called this line, carried back so applying can record what
   * the reviewer decided it meant - see productMatching.rememberLineDecisions.
   * Optional because a line added by hand has neither.
   */
  code?: string | null;
  description?: string | null;
};

export type ApplyInvoiceRequest = {
  lines: ApplyInvoiceLineInput[];
};
