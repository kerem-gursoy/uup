import type { Prisma } from "@prisma/client";
import { env } from "cloudflare:workers";
import { parseInvoiceWithGemini } from "./gemini.js";
import {
  ParsedInvoiceLine,
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

const normalizeLineItem = (line: RawGeminiInvoice["line_items"][number]): ParsedInvoiceLine => {
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
    matchedProductId: null,
    matchedProductName: null,
    matchedBrand: null,
    matchScore: 0,
    priceMismatch: disagreesWithTotal(quantity, unitPrice, totalPrice),
  };
};

export const parseAndMatchInvoice = async (
  client: Prisma.TransactionClient,
  invoiceId: number
): Promise<ParsedInvoiceResponse> => {
  const invoice = await client.invoice.findUnique({
    where: { id: invoiceId },
    include: { supplier: true },
  });

  if (!invoice) {
    throw new Error("Invoice not found");
  }

  // Workers has no filesystem. `storedPath` now holds an R2 object key - same
  // column, same shape, different backing store.
  const object = await env.INVOICES_BUCKET.get(invoice.storedPath);
  if (!object) {
    throw new Error("Invoice file not found in storage");
  }
  // Buffer is available under nodejs_compat, so gemini.ts needs no change.
  const fileBuffer = Buffer.from(await object.arrayBuffer());

  const parsedInvoice = await parseInvoiceWithGemini(
    fileBuffer,
    invoice.mimeType
  );

  const lines: ParsedInvoiceLine[] = [];

  for (const line of parsedInvoice.line_items ?? []) {
    const parsedLine = normalizeLineItem(line);

    // Skip DB matching during parsing; leave matching for finalization step.
    lines.push(parsedLine);
  }

  await client.invoice.update({
    where: { id: invoiceId },
    data: { status: "PARSED" },
  });

  return {
    invoiceId: invoice.id,
    supplierId: invoice.supplierId,
    supplierName: invoice.supplier.name,
    supplierFromDocument: parsedInvoice.supplier_name ?? null,
    issueDate: parsedInvoice.issue_date ?? null,
    currency: parsedInvoice.currency ?? null,
    lines,
  };
};
