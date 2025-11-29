import fs from "fs/promises";
import path from "path";
import { fileURLToPath } from "url";
import { prisma } from "../lib/prisma";
import { parseInvoiceWithGemini } from "./gemini";
import {
  ParsedInvoiceLine,
  ParsedInvoiceResponse,
  RawGeminiInvoice,
} from "./invoiceTypes";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

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

const normalizeLineItem = (line: RawGeminiInvoice["line_items"][number]): ParsedInvoiceLine => {
  const description = typeof line.description === "string" ? line.description.trim() : "";

  return {
    lineNo: toNullableNumber(line.line_no),
    code: toNullableString(line.code),
    description,
    barcode: toNullableString(line.barcode),
    quantity: toNullableNumber(line.quantity),
    unit: toNullableString(line.unit),
    unitPrice: toNullableNumber(line.unit_price),
    totalPrice: toNullableNumber(line.total_price),
    matchedProductId: null,
    matchedProductName: null,
    matchedBrand: null,
    matchScore: 0,
  };
};

export const parseAndMatchInvoice = async (
  invoiceId: number
): Promise<ParsedInvoiceResponse> => {
  const invoice = await prisma.invoice.findUnique({
    where: { id: invoiceId },
    include: { supplier: true },
  });

  if (!invoice) {
    throw new Error("Invoice not found");
  }

  const filePath = path.join(__dirname, "..", invoice.storedPath);
  const fileBuffer = await fs.readFile(filePath);

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

  await prisma.invoice.update({
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
