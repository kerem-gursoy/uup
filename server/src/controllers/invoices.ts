import fs from "fs";
import path from "path";
import crypto from "crypto";
import multer from "multer";
import { Request, Response } from "express";
import { prisma } from "../lib/prisma";
import { parseId } from "../utils/parseId";
import { fileURLToPath } from "url";

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
