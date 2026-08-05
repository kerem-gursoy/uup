import type { Prisma } from "@prisma/client";
import { env } from "cloudflare:workers";
import { HttpError } from "../lib/httpError.js";
import { parseInvoiceWithGemini } from "./gemini.js";
import {
  buildParsedResponse,
  CLEARED_DRAFT,
  decodeParse,
  encodeParse,
} from "./invoiceReview.js";
import {
  CachedInvoiceParse,
  DocumentLine,
  ParsedInvoiceResponse,
  RawGeminiInvoice,
} from "./invoiceTypes.js";

const toNullableNumber = (value: unknown): number | null => {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }
  if (typeof value === "string") {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
};

const toNullableString = (value: unknown): string | null => {
  if (typeof value !== "string") {
    return null;
  }
  const trimmed = value.trim();
  return trimmed.length ? trimmed : null;
};

/** How far quantity × unit price may drift from the printed row total before it
 *  is worth asking a human. Wide enough to absorb the invoice's own rounding. */
const TOTAL_TOLERANCE = 0.02;

/**
 * Does the row add up? Only answerable when all three figures were read, and
 * deliberately silent when the total is zero - a zero row is a free item or a
 * heading, not a misread price.
 */
const disagreesWithTotal = (
  quantity: number | null,
  unitPrice: number | null,
  totalPrice: number | null
): boolean => {
  if (quantity === null || unitPrice === null || totalPrice === null) return false;
  if (totalPrice === 0) return false;

  return Math.abs(quantity * unitPrice - totalPrice) / Math.abs(totalPrice) > TOTAL_TOLERANCE;
};

const normalizeLineItem = (line: RawGeminiInvoice["line_items"][number]): DocumentLine => {
  const description = typeof line.description === "string" ? line.description.trim() : "";

  const quantity = toNullableNumber(line.quantity);
  const unitPrice = toNullableNumber(line.unit_price);
  const totalPrice = toNullableNumber(line.total_price);

  return {
    lineNo: toNullableNumber(line.line_no),
    code: toNullableString(line.code),
    description,
    barcode: toNullableString(line.barcode),
    quantity,
    unit: toNullableString(line.unit),
    unitPrice,
    totalPrice,
    priceMismatch: disagreesWithTotal(quantity, unitPrice, totalPrice),
  };
};

/** Sends the photo to Gemini and shapes what comes back. The paid part. */
const readInvoiceDocument = async (
  storedPath: string,
  mimeType: string
): Promise<CachedInvoiceParse> => {
  // Workers has no filesystem. `storedPath` now holds an R2 object key - same
  // column, same shape, different backing store.
  const object = await env.INVOICES_BUCKET.get(storedPath);
  if (!object) {
    throw new Error("Invoice file not found in storage");
  }
  // Buffer is available under nodejs_compat, so gemini.ts needs no change.
  const fileBuffer = Buffer.from(await object.arrayBuffer());

  const { invoice: parsedInvoice, usage } = await parseInvoiceWithGemini(
    fileBuffer,
    mimeType
  );

  // Only what the document itself says is stored. Product matching is resolved
  // on every read instead - see invoiceTypes.ts for why caching it would be
  // wrong.
  return {
    supplierFromDocument: parsedInvoice.supplier_name ?? null,
    issueDate: parsedInvoice.issue_date ?? null,
    currency: parsedInvoice.currency ?? null,
    totals: {
      subtotal: toNullableNumber(parsedInvoice.subtotal),
      vatTotal: toNullableNumber(parsedInvoice.vat_total),
      grandTotal: toNullableNumber(parsedInvoice.grand_total),
    },
    lines: (parsedInvoice.line_items ?? []).map(normalizeLineItem),
    usage,
  };
};

/**
 * The reading the review screen works from.
 *
 * Cached by default, because the input is a photograph that cannot change: the
 * same document read twice can only give the same answer, and each reading is a
 * multi-second Gemini call the shop pays for. Before this was stored, simply
 * switching apps mid-review and coming back bought a second one.
 *
 * `refresh` is the way past the cache, and exists because a reading is a
 * judgement, not a fact - when the model has misread the page badly, asking
 * again is the only remedy. It costs the draft, whose line positions belong to
 * the reading being replaced.
 */
export const parseAndMatchInvoice = async (
  client: Prisma.TransactionClient,
  invoiceId: number,
  { refresh = false }: { refresh?: boolean } = {}
): Promise<ParsedInvoiceResponse> => {
  const invoice = await client.invoice.findUnique({
    where: { id: invoiceId },
    select: {
      id: true,
      supplierId: true,
      status: true,
      storedPath: true,
      mimeType: true,
      parsedJson: true,
      parsedAt: true,
      supplier: { select: { name: true } },
    },
  });

  if (!invoice) {
    throw new HttpError("Invoice not found", 404);
  }

  if (!refresh && invoice.parsedAt) {
    const cached = decodeParse(invoice.parsedJson);
    if (cached) {
      return buildParsedResponse(client, invoice, cached, invoice.parsedAt);
    }
  }

  // An applied invoice's movements are already written, and its reading is the
  // record of where they came from. Replacing that would spend a paid call to
  // rewrite history nobody can act on - so it is refused here the same way
  // saving a draft against one is.
  if (invoice.status === "APPLIED") {
    throw new HttpError("Invoice already applied", 409);
  }

  const parse = await readInvoiceDocument(invoice.storedPath, invoice.mimeType);
  const parsedAt = new Date();

  await client.invoice.update({
    where: { id: invoiceId },
    data: {
      status: "PARSED",
      parsedJson: encodeParse(parse),
      parsedAt,
      // A draft describes lines that no longer exist. Cleared in the same write
      // as the reading that replaces them, so the two can never disagree.
      ...CLEARED_DRAFT,
    },
  });

  return buildParsedResponse(client, invoice, parse, parsedAt);
};
