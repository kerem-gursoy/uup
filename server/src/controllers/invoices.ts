import fs from "fs";
import path from "path";
import crypto from "crypto";
import multer from "multer";
import { Request, Response } from "express";
import { prisma } from "../lib/prisma";
import { parseId } from "../utils/parseId";
import { fileURLToPath } from "url";
import { parseAndMatchInvoice } from "../services/invoiceParsing";
import { applyInvoice } from "../services/invoiceApply";
import { ApplyInvoiceRequest } from "../services/invoiceTypes";

// __filename and __dirname polyfill for ES modules
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const invoicesUploadDir = path.join(__dirname, "..", "uploads", "invoices");
fs.mkdirSync(invoicesUploadDir, { recursive: true });

export const invoiceUpload = multer({
  storage: multer.diskStorage({
    destination: (_req, _file, cb) => {
      cb(null, invoicesUploadDir);
    },
    filename: (_req, file, cb) => {
      const id = crypto.randomUUID();
      const ext = path.extname(file.originalname) || "";
      cb(null, `${id}${ext}`);
    },
  }),
  limits: { fileSize: 5 * 1024 * 1024 },
});

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

    const supplier = await prisma.supplier.findUnique({
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

    const storedRelativePath = path.join("uploads", "invoices", req.file.filename);

    const invoice = await prisma.invoice.create({
      data: {
        supplierId,
        originalName: req.file.originalname,
        storedPath: storedRelativePath,
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
    const invoices = await prisma.invoice.findMany({
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

    const invoice = await prisma.invoice.findUnique({
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
    const parsed = await parseAndMatchInvoice(id);
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
    const summary = await applyInvoice(id, body);
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
