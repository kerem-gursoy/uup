import multer from "multer";
import { Request, Response } from "express";
import { env } from "cloudflare:workers";
import { HttpError } from "../lib/httpError.js";
import { parseId } from "../utils/parseId.js";
import { parseAndMatchInvoice } from "../services/invoiceParsing.js";
import { applyInvoice } from "../services/invoiceApply.js";
import {
  clearInvoiceDraft,
  readInvoiceReviewState,
  saveInvoiceDraft,
  type SaveDraftRequest,
} from "../services/invoiceReview.js";
import { ApplyInvoiceRequest } from "../services/invoiceTypes.js";

/**
 * Workers has no filesystem, so the upload is buffered in memory and written
 * straight to R2. Only the storage engine changes - the route wiring
 * (`invoiceUpload.single("file")`) and multer's own 5MB limit are untouched,
 * and the limit is what keeps "buffer it in memory" safe.
 */
export const invoiceUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 },
});

/** Extension kept on the R2 key so objects stay recognisable when browsing the bucket. */
const extensionOf = (filename: string) => {
  const dot = filename.lastIndexOf(".");
  return dot > 0 ? filename.slice(dot) : "";
};

export const uploadInvoice = async (req: Request, res: Response) => {
  try {
    const supplierIdRaw = req.body.supplierId;

    if (!supplierIdRaw) {
      return res.status(400).json({ error: "supplierId is required" });
    }

    let supplierId: number;
    try {
      supplierId = parseId(String(supplierIdRaw));
    } catch {
      return res.status(400).json({ error: "Invalid supplierId" });
    }

    const supplier = await req.prisma.supplier.findUnique({
      where: { id: supplierId },
    });

    if (!supplier) {
      return res.status(404).json({ error: "Supplier not found" });
    }

    if (!req.file) {
      return res
        .status(400)
        .json({ error: "No file uploaded (field 'file' is required)" });
    }

    // Written to R2 before the row is created, so a failed upload never leaves an
    // Invoice record pointing at an object that does not exist.
    const objectKey = `${crypto.randomUUID()}${extensionOf(req.file.originalname)}`;
    await env.INVOICES_BUCKET.put(objectKey, req.file.buffer, {
      httpMetadata: { contentType: req.file.mimetype },
    });

    const invoice = await req.prisma.invoice.create({
      data: {
        supplierId,
        originalName: req.file.originalname,
        // Same column as before; it now holds an R2 object key rather than a
        // relative disk path. No schema change.
        storedPath: objectKey,
        mimeType: req.file.mimetype,
      },
      include: {
        supplier: true,
      },
    });

    return res.status(201).json({
      invoiceId: invoice.id,
      supplier: {
        id: invoice.supplier.id,
        name: invoice.supplier.name,
      },
      file: {
        originalName: invoice.originalName,
        mimeType: invoice.mimeType,
        storedPath: invoice.storedPath,
      },
      status: invoice.status,
      createdAt: invoice.createdAt,
    });
  } catch (err) {
    console.error("Error uploading invoice:", err);
    return res.status(500).json({ error: "Internal server error" });
  }
};

export const listInvoices = async (req: Request, res: Response) => {
  try {
    // Explicitly selected rather than `include: { supplier: true }`, which takes
    // every scalar on the row - and those now include the whole cached reading
    // and the whole draft. Listing twenty invoices would have read, and thrown
    // away, twenty parsed documents.
    const invoices = await req.prisma.invoice.findMany({
      orderBy: { createdAt: "desc" },
      select: {
        id: true,
        originalName: true,
        storedPath: true,
        mimeType: true,
        status: true,
        createdAt: true,
        draftUpdatedAt: true,
        supplier: { select: { id: true, name: true } },
      },
    });

    res.json(
      invoices.map((inv) => ({
        id: inv.id,
        supplier: {
          id: inv.supplier.id,
          name: inv.supplier.name,
        },
        originalName: inv.originalName,
        storedPath: inv.storedPath,
        mimeType: inv.mimeType,
        status: inv.status,
        createdAt: inv.createdAt,
        // Whether somebody has started reviewing this one and stopped part way.
        // The timestamp rather than the draft itself: the list wants to say "you
        // were here", not carry every line of every unfinished review.
        startedAt: inv.draftUpdatedAt,
      }))
    );
  } catch (err) {
    console.error("Error fetching invoices:", err);
    res.status(500).json({ error: "Internal server error" });
  }
};

export const getInvoice = async (req: Request, res: Response) => {
  try {
    const id = parseId(req.params.id);

    const invoice = await req.prisma.invoice.findUnique({
      where: { id },
      // Selected for the same reason as the list above: the reading and the
      // draft live on this row now, and nothing here needs either of them.
      select: {
        id: true,
        originalName: true,
        storedPath: true,
        mimeType: true,
        status: true,
        createdAt: true,
        supplier: { select: { id: true, name: true } },
      },
    });

    if (!invoice) {
      return res.status(404).json({ error: "Invoice not found" });
    }

    res.json({
      id: invoice.id,
      supplier: {
        id: invoice.supplier.id,
        name: invoice.supplier.name,
      },
      originalName: invoice.originalName,
      storedPath: invoice.storedPath,
      mimeType: invoice.mimeType,
      status: invoice.status,
      createdAt: invoice.createdAt,
    });
  } catch (err) {
    console.error("Error fetching invoice:", err);
    res.status(400).json({ error: "Invalid invoice id" });
  }
};

/** The id in the path, or null with a 400 already written to the response. */
const invoiceIdFrom = (req: Request, res: Response): number | null => {
  try {
    return parseId(req.params.id);
  } catch {
    res.status(400).json({ error: "Invalid invoice id" });
    return null;
  }
};

/**
 * Rejections carry their own status and a message written for the user; anything
 * else is a genuine fault and says nothing beyond that.
 */
const replyToFailure = (
  res: Response,
  err: unknown,
  context: string,
  fallback: string
) => {
  if (err instanceof HttpError) {
    return res.status(err.status).json({ error: err.message });
  }
  console.error(context, err);
  return res.status(500).json({ error: fallback });
};

/**
 * What the review screen needs to open: the stored reading, and whatever review
 * was left unfinished against it. Either may be null.
 *
 * A plain read on purpose. Its whole point is that reopening an invoice costs
 * nothing - no Gemini call, no write - which is why the reading is not produced
 * here on demand. Ask for one with POST /parse.
 */
export const getInvoiceReview = async (req: Request, res: Response) => {
  const id = invoiceIdFrom(req, res);
  if (id === null) return;

  try {
    return res.json(await readInvoiceReviewState(req.prisma, id));
  } catch (err) {
    return replyToFailure(
      res,
      err,
      "Error loading invoice review state:",
      "Failed to load invoice"
    );
  }
};

/**
 * Reads the invoice, or hands back the reading already stored for it.
 *
 * `?refresh=1` forces a fresh reading. It is the only thing on this route that
 * spends money, so it stays opt-in and explicit rather than something a page
 * reload can trigger by accident.
 */
export const parseInvoice = async (req: Request, res: Response) => {
  const id = invoiceIdFrom(req, res);
  if (id === null) return;

  const refresh = req.query.refresh === "1" || req.query.refresh === "true";

  try {
    const parsed = await parseAndMatchInvoice(req.prisma, id, { refresh });
    return res.json(parsed);
  } catch (err) {
    if (err instanceof Error && err.message.includes("GEMINI_API_KEY")) {
      console.error("Error parsing invoice:", err);
      return res.status(500).json({ error: "Gemini misconfiguration" });
    }
    return replyToFailure(
      res,
      err,
      "Error parsing invoice:",
      "Failed to parse invoice"
    );
  }
};

/** Stores the unfinished review, so leaving the screen is not losing the work. */
export const putInvoiceDraft = async (req: Request, res: Response) => {
  const id = invoiceIdFrom(req, res);
  if (id === null) return;

  try {
    const draft = await saveInvoiceDraft(
      req.prisma,
      id,
      req.body as SaveDraftRequest
    );
    return res.json(draft);
  } catch (err) {
    return replyToFailure(
      res,
      err,
      "Error saving invoice draft:",
      "Failed to save draft"
    );
  }
};

/** Throws the unfinished review away, keeping the reading it was made against. */
export const deleteInvoiceDraft = async (req: Request, res: Response) => {
  const id = invoiceIdFrom(req, res);
  if (id === null) return;

  try {
    await clearInvoiceDraft(req.prisma, id);
    return res.status(204).end();
  } catch (err) {
    return replyToFailure(
      res,
      err,
      "Error discarding invoice draft:",
      "Failed to discard draft"
    );
  }
};

export const applyParsedInvoice = async (req: Request, res: Response) => {
  const id = invoiceIdFrom(req, res);
  if (id === null) return;

  const body = req.body as ApplyInvoiceRequest;
  if (!body || !Array.isArray(body.lines)) {
    return res.status(400).json({ error: "lines[] is required" });
  }

  try {
    const summary = await applyInvoice(req.prisma, id, body);
    return res.json(summary);
  } catch (err) {
    return replyToFailure(
      res,
      err,
      "Error applying invoice:",
      "Failed to apply invoice"
    );
  }
};
