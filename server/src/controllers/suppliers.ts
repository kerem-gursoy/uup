import { Request, Response } from "express";
import { Prisma } from "@prisma/client";
import { parseId } from "../utils/parseId.js";
import {
  supplierDisplayName,
  supplierNameFingerprint,
  supplierNameKey,
} from "../services/supplierNames.js";

const MAX_NAME_LENGTH = 120;

type NameCheck =
  | { ok: false; error: string }
  | { ok: true; name: string; key: string };

const validateName = (raw: unknown): NameCheck => {
  if (typeof raw !== "string" || !raw.trim()) {
    return { ok: false, error: "Please enter a supplier name" };
  }

  const name = supplierDisplayName(raw);

  if (name.length > MAX_NAME_LENGTH) {
    return {
      ok: false,
      error: `Supplier name must be ${MAX_NAME_LENGTH} characters or fewer`,
    };
  }

  // Guards against a name made only of punctuation or symbols, which would be
  // impossible to search for later.
  if (!/[\p{L}\p{N}]/u.test(name)) {
    return { ok: false, error: "Supplier name must contain a letter or a number" };
  }

  return { ok: true, name, key: supplierNameKey(name) };
};

const publicSupplier = (supplier: { id: number; name: string }) => ({
  id: supplier.id,
  name: supplier.name,
});

/**
 * Suppliers whose names look like the given one without being the same: equal
 * once accents, case, spacing and punctuation are ignored.
 *
 * Computed in the application rather than in SQL, because the comparison needs
 * Unicode normalisation SQLite cannot do, and there are few enough suppliers
 * that scanning them all beats being clever.
 */
const findSimilarSuppliers = async (
  client: Prisma.TransactionClient,
  name: string,
  excludeKey: string
) => {
  const fingerprint = supplierNameFingerprint(name);
  if (!fingerprint) return [];

  const suppliers = await client.supplier.findMany({ orderBy: { name: "asc" } });

  return suppliers
    .filter(
      (supplier) =>
        supplier.nameKey !== excludeKey &&
        supplierNameFingerprint(supplier.name) === fingerprint
    )
    .map(publicSupplier);
};

/**
 * Reports what already exists for a proposed name, creating nothing.
 *
 * The client calls this while the user types, so a duplicate can be headed off
 * before it is made rather than merely rejected afterwards.
 */
export const checkSupplierName = async (req: Request, res: Response) => {
  try {
    const check = validateName(req.query.name);
    if (!check.ok) {
      return res.json({ valid: false, error: check.error, exact: null, similar: [] });
    }

    const exact = await req.prisma.supplier.findUnique({
      where: { nameKey: check.key },
    });

    res.json({
      valid: true,
      /** The name exactly as it would be saved, so the user can confirm it. */
      normalizedName: check.name,
      exact: exact ? publicSupplier(exact) : null,
      similar: exact
        ? []
        : await findSimilarSuppliers(req.prisma, check.name, check.key),
    });
  } catch (err) {
    console.error("Error checking supplier name:", err);
    res.status(500).json({ error: "Internal server error" });
  }
};

export const createSupplier = async (req: Request, res: Response) => {
  try {
    const check = validateName(req.body?.name);
    if (!check.ok) {
      return res.status(400).json({ error: check.error });
    }

    const existing = await req.prisma.supplier.findUnique({
      where: { nameKey: check.key },
    });

    // Reported with the offending supplier attached, so the client can offer to
    // use it instead of leaving the user stuck.
    if (existing) {
      return res.status(409).json({
        error: `"${existing.name}" is already in your supplier list`,
        existing: publicSupplier(existing),
      });
    }

    const supplier = await req.prisma.supplier.create({
      data: { name: check.name, nameKey: check.key },
    });

    res.status(201).json(publicSupplier(supplier));
  } catch (err) {
    // The unique index is the real guarantee; this catches the race where two
    // requests both pass the check above.
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") {
      return res.status(409).json({ error: "That supplier is already in your list" });
    }
    console.error("Error creating supplier:", err);
    res.status(500).json({ error: "Internal server error" });
  }
};

/**
 * Every supplier with how much is attached to it. The counts drive the manage
 * screen: a supplier in use cannot be removed, and saying how many products
 * hold it is more useful than only refusing.
 */
export const listSuppliers = async (req: Request, res: Response) => {
  try {
    const suppliers = await req.prisma.supplier.findMany({
      orderBy: { name: "asc" },
      include: {
        _count: { select: { products: true, invoices: true } },
      },
    });

    res.json(
      suppliers.map((supplier) => ({
        ...publicSupplier(supplier),
        productCount: supplier._count.products,
        invoiceCount: supplier._count.invoices,
      }))
    );
  } catch (err) {
    console.error("Error fetching suppliers:", err);
    res.status(500).json({ error: "Internal server error" });
  }
};

export const getSupplier = async (req: Request, res: Response) => {
  try {
    const id = parseId(req.params.id);

    const supplier = await req.prisma.supplier.findUnique({
      where: { id },
      include: { products: true },
    });

    if (!supplier) {
      return res.status(404).json({ error: "Supplier not found" });
    }

    res.json({ ...publicSupplier(supplier), products: supplier.products });
  } catch (err) {
    console.error("Error fetching supplier:", err);
    res.status(400).json({ error: "Invalid supplier id" });
  }
};

export const updateSupplier = async (req: Request, res: Response) => {
  try {
    const id = parseId(req.params.id);
    const check = validateName(req.body?.name);
    if (!check.ok) {
      return res.status(400).json({ error: check.error });
    }

    const clash = await req.prisma.supplier.findUnique({
      where: { nameKey: check.key },
    });

    if (clash && clash.id !== id) {
      return res.status(409).json({
        error: `"${clash.name}" is already in your supplier list`,
        existing: publicSupplier(clash),
      });
    }

    // Renaming must keep the key in step, or the uniqueness guarantee lapses.
    const supplier = await req.prisma.supplier.update({
      where: { id },
      data: { name: check.name, nameKey: check.key },
    });

    res.json(publicSupplier(supplier));
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") {
      return res.status(409).json({ error: "That supplier is already in your list" });
    }
    console.error("Error updating supplier:", err);
    res.status(400).json({ error: "Invalid supplier id or data" });
  }
};

export const deleteSupplier = async (req: Request, res: Response) => {
  try {
    const id = parseId(req.params.id);

    // A supplier still attached to products or invoices must not vanish, or those
    // records would point at nothing. Say what is in the way instead.
    const [products, invoices] = await Promise.all([
      req.prisma.product.count({ where: { supplierId: id } }),
      req.prisma.invoice.count({ where: { supplierId: id } }),
    ]);

    if (products > 0 || invoices > 0) {
      const parts = [
        products > 0 && `${products} product${products === 1 ? "" : "s"}`,
        invoices > 0 && `${invoices} invoice${invoices === 1 ? "" : "s"}`,
      ].filter(Boolean);

      return res.status(409).json({
        error: `This supplier is still used by ${parts.join(" and ")}, so it cannot be removed`,
      });
    }

    await req.prisma.supplier.delete({ where: { id } });

    res.status(204).send();
  } catch (err) {
    console.error("Error deleting supplier:", err);
    res.status(400).json({ error: "Invalid supplier id" });
  }
};
