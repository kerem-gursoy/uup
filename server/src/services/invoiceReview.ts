import type { Prisma } from "@prisma/client";
import { HttpError } from "../lib/httpError.js";
import {
  CachedInvoiceParse,
  InvoiceDraft,
  InvoiceReviewState,
  ParsedInvoiceResponse,
} from "./invoiceTypes.js";

/**
 * What the review screen keeps between visits, and the rules about it.
 *
 * Two separate things live on the Invoice row, and it is worth being clear which
 * is which:
 *
 *   parsedJson  the reading of the document. Expensive (a Gemini call), and
 *               derived from a photo that can never change, so it is cached and
 *               only ever recomputed when someone explicitly asks for a re-read.
 *
 *   draftJson   the reviewer's unfinished corrections. Cheap, changes constantly,
 *               and belongs to exactly one reading - see `parsedAt` below.
 *
 * Reading and drafting are stored together but invalidated in one direction
 * only: a new reading discards the draft, never the reverse.
 */

/**
 * Bumped when the stored shape changes. A cache is allowed to be thrown away, so
 * an entry written by an older version reads as "nothing cached" and the invoice
 * is simply read again - no migration, and no chance of handing the review
 * screen a shape it no longer understands.
 */
const PARSE_CACHE_VERSION = 1;

type StoredParse = CachedInvoiceParse & { v: number };

type StoredDraft = { lines: unknown[] };

/**
 * Guards on the draft, which is otherwise opaque to this file.
 *
 * Opaque on purpose: the draft is the review screen's own state, and a
 * server-side mirror of that type would be a second definition to keep in step
 * with the first for no benefit - nothing here reads a line's fields. What the
 * server does owe is a limit, because "store whatever the client sends" against
 * a shared database is not a position to be in. Characters rather than bytes:
 * the point is a ceiling comfortably under D1's own statement limit, not an
 * exact accounting.
 */
const MAX_DRAFT_LINES = 500;
const MAX_DRAFT_CHARS = 256 * 1024;

/** The Invoice columns every function here needs. */
const REVIEW_SELECT = {
  id: true,
  supplierId: true,
  status: true,
  parsedJson: true,
  parsedAt: true,
  draftJson: true,
  draftUpdatedAt: true,
  supplier: { select: { name: true } },
} as const;

type InvoiceReviewRow = {
  id: number;
  supplierId: number;
  status: string;
  parsedJson: string | null;
  parsedAt: Date | null;
  draftJson: string | null;
  draftUpdatedAt: Date | null;
  supplier: { name: string };
};

const findInvoiceForReview = async (
  client: Prisma.TransactionClient,
  invoiceId: number
): Promise<InvoiceReviewRow> => {
  const invoice = await client.invoice.findUnique({
    where: { id: invoiceId },
    select: REVIEW_SELECT,
  });

  if (!invoice) {
    throw new HttpError("Invoice not found", 404);
  }

  return invoice;
};

/** The stored reading, or null when there is none this version can use. */
export const decodeParse = (json: string | null): CachedInvoiceParse | null => {
  if (!json) return null;

  try {
    const stored = JSON.parse(json) as Partial<StoredParse> | null;
    if (!stored || stored.v !== PARSE_CACHE_VERSION || !Array.isArray(stored.lines)) {
      return null;
    }

    return {
      supplierFromDocument: stored.supplierFromDocument ?? null,
      issueDate: stored.issueDate ?? null,
      currency: stored.currency ?? null,
      lines: stored.lines,
    };
  } catch {
    // Unreadable JSON is treated the same as no cache at all. Nothing is lost
    // that a re-read cannot produce again.
    return null;
  }
};

export const encodeParse = (parse: CachedInvoiceParse): string =>
  JSON.stringify({ v: PARSE_CACHE_VERSION, ...parse } satisfies StoredParse);

/**
 * The reading joined back to the live Supplier row.
 *
 * Only the document half is cached, so a supplier renamed since the invoice was
 * read shows its current name here rather than the one frozen at parse time.
 */
export const buildParsedResponse = (
  invoice: { id: number; supplierId: number; supplier: { name: string } },
  parse: CachedInvoiceParse,
  parsedAt: Date
): ParsedInvoiceResponse => ({
  invoiceId: invoice.id,
  supplierId: invoice.supplierId,
  supplierName: invoice.supplier.name,
  parsedAt: parsedAt.toISOString(),
  ...parse,
});

const decodeDraft = (
  json: string | null,
  updatedAt: Date | null
): InvoiceDraft | null => {
  if (!json || !updatedAt) return null;

  try {
    const stored = JSON.parse(json) as Partial<StoredDraft> | null;
    if (!stored || !Array.isArray(stored.lines)) return null;

    return { lines: stored.lines, updatedAt: updatedAt.toISOString() };
  } catch {
    return null;
  }
};

/**
 * Everything the review screen needs to open, without doing any paid work.
 *
 * `parsed` is null only when this invoice has never been read, which is the one
 * case where the screen has to ask for a reading and wait.
 */
export const readInvoiceReviewState = async (
  client: Prisma.TransactionClient,
  invoiceId: number
): Promise<InvoiceReviewState> => {
  const invoice = await findInvoiceForReview(client, invoiceId);
  const parse = invoice.parsedAt ? decodeParse(invoice.parsedJson) : null;

  if (!parse || !invoice.parsedAt) {
    return { parsed: null, draft: null };
  }

  return {
    parsed: buildParsedResponse(invoice, parse, invoice.parsedAt),
    // A draft is only ever stored against the current reading, so no staleness
    // check is needed on the way out - see saveInvoiceDraft for the way in.
    draft: decodeDraft(invoice.draftJson, invoice.draftUpdatedAt),
  };
};

export type SaveDraftRequest = {
  /** The `parsedAt` of the reading these lines were edited against. */
  parsedAt: string;
  lines: unknown[];
};

/**
 * Stores the unfinished review.
 *
 * The `parsedAt` check is what keeps a draft honest. Autosave is debounced, so a
 * save can be in flight while the reviewer asks for a re-read; without the
 * check, that late write would land on top of the fresh reading and restore
 * corrections that point at line numbers which no longer exist. Refusing it
 * costs the reviewer nothing - the re-read replaced those lines anyway.
 */
export const saveInvoiceDraft = async (
  client: Prisma.TransactionClient,
  invoiceId: number,
  body: SaveDraftRequest
): Promise<InvoiceDraft> => {
  if (!body || !Array.isArray(body.lines)) {
    throw new HttpError("lines[] is required", 400);
  }
  if (typeof body.parsedAt !== "string") {
    throw new HttpError("parsedAt is required", 400);
  }
  if (body.lines.length > MAX_DRAFT_LINES) {
    throw new HttpError(
      `A draft cannot hold more than ${MAX_DRAFT_LINES} lines`,
      413
    );
  }

  const invoice = await findInvoiceForReview(client, invoiceId);

  if (invoice.status === "APPLIED") {
    throw new HttpError("Invoice already applied", 409);
  }
  if (!invoice.parsedAt) {
    throw new HttpError("Invoice has not been read yet", 409);
  }
  if (invoice.parsedAt.toISOString() !== body.parsedAt) {
    throw new HttpError("Invoice has been read again since these changes", 409);
  }

  const draftJson = JSON.stringify({ lines: body.lines } satisfies StoredDraft);
  if (draftJson.length > MAX_DRAFT_CHARS) {
    throw new HttpError("That draft is too large to save", 413);
  }

  const updatedAt = new Date();
  await client.invoice.update({
    where: { id: invoiceId },
    data: { draftJson, draftUpdatedAt: updatedAt },
  });

  return { lines: body.lines, updatedAt: updatedAt.toISOString() };
};

/** The Prisma fields that leave no draft behind, for callers building a batch. */
export const CLEARED_DRAFT = { draftJson: null, draftUpdatedAt: null } as const;

/** Throws away the unfinished review, leaving the reading in place. */
export const clearInvoiceDraft = async (
  client: Prisma.TransactionClient,
  invoiceId: number
): Promise<void> => {
  await findInvoiceForReview(client, invoiceId);

  await client.invoice.update({
    where: { id: invoiceId },
    data: CLEARED_DRAFT,
  });
};
