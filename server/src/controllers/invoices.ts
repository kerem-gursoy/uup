import multer from "multer";
import { Request, Response } from "express";
import { env } from "cloudflare:workers";
import { parseId } from "../utils/parseId.js";
import { parseAndMatchInvoice } from "../services/invoiceParsing.js";
import { applyInvoice } from "../services/invoiceApply.js";
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
    const invoices = await req.prisma.invoice.findMany({
      orderBy: { createdAt: "desc" },
      include: { supplier: true },
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
      include: { supplier: true },
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

export const parseInvoice = async (req: Request, res: Response) => {
  let id: number;
  try {
    id = parseId(req.params.id);
  } catch {
    return res.status(400).json({ error: "Invalid invoice id" });
  }

  try {
    const parsed = await parseAndMatchInvoice(req.prisma, id);
    return res.json(parsed);
  } catch (err) {
    console.error("Error parsing invoice:", err);
    if (err instanceof Error && err.message === "Invoice not found") {
      return res.status(404).json({ error: "Invoice not found" });
    }
    if (err instanceof Error && err.message.includes("GEMINI_API_KEY")) {
      return res.status(500).json({ error: "Gemini misconfiguration" });
    }
    return res.status(500).json({ error: "Failed to parse invoice" });
  }
};

export const applyParsedInvoice = async (req: Request, res: Response) => {
  let id: number;
  try {
    id = parseId(req.params.id);
  } catch {
    return res.status(400).json({ error: "Invalid invoice id" });
  }

  const body = req.body as ApplyInvoiceRequest;
  if (!body || !Array.isArray(body.lines)) {
    return res.status(400).json({ error: "lines[] is required" });
  }

  try {
    const summary = await applyInvoice(req.prisma, id, body);
    return res.json(summary);
  } catch (err) {
    console.error("Error applying invoice:", err);
    if (err instanceof Error && err.message === "Invoice not found") {
      return res.status(404).json({ error: "Invoice not found" });
    }
    if (err instanceof Error && err.message === "Invoice already applied") {
      return res.status(409).json({ error: "Invoice already applied" });
    }
    if (err instanceof Error && err.message.startsWith("Invalid")) {
      return res.status(400).json({ error: err.message });
    }
    return res.status(500).json({ error: "Failed to apply invoice" });
  }
};
