import { Request, Response } from "express";
import { Prisma } from "@prisma/client";
import { parseId } from "../utils/parseId.js";
import {
  findCostRoseSincePriceSet,
  getCurrentStock,
  LOW_STOCK_THRESHOLD,
  getLatestPrices,
  loadProductsWithNumbers,
  isPriceKind,
  recordPrice,
  type PriceKind,
} from "../services/inventory.js";

type ProductInput = {
  name?: string;
  barcode?: string | null;
  brand?: string | null;
  supplierId?: number | null;
};

/** Thrown for input we can explain to the user in plain language. */
class InvalidInput extends Error {}

const isDuplicateBarcode = (err: unknown) =>
  err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002";

/**
 * Money always crosses the API as a whole number of cents so no rounding can
 * creep in. Anything else is a client bug worth reporting clearly.
 */
const parseMoneyCents = (value: unknown, label: string): number => {
  if (!Number.isInteger(value) || (value as number) <= 0) {
    throw new InvalidInput(`${label} must be a positive whole number of cents`);
  }
  return value as number;
};

/**
 * Prices can be backdated - a shop moving off paper needs to record what it
 * paid last month, not just today.
 */
const parseEffectiveFrom = (value: unknown): Date | undefined => {
  if (value === undefined || value === null || value === "") return undefined;

  const date = new Date(value as string);
  if (Number.isNaN(date.getTime())) {
    throw new InvalidInput("effectiveFrom must be a valid date");
  }
  return date;
};

const parseSupplierId = (value: unknown): number | null => {
  if (value === undefined || value === null || value === "") return null;

  const supplierId = Number(value);
  if (!Number.isInteger(supplierId) || supplierId <= 0) {
    throw new InvalidInput("supplierId must be a positive whole number");
  }
  return supplierId;
};

const respondToInputError = (res: Response, err: unknown, fallback: string) => {
  if (err instanceof InvalidInput) {
    return res.status(400).json({ error: err.message });
  }
  if (isDuplicateBarcode(err)) {
    return res
      .status(409)
      .json({ error: "Another product already uses that barcode" });
  }
  return res.status(400).json({ error: fallback });
};

/**
 * Creating a product optionally seeds everything a shop knows about it on day
 * one: how many are on the shelf, what it cost, and what it sells for. All of
 * it lands in one transaction so a product is never left half set up.
 */
export const createProduct = async (req: Request, res: Response) => {
  try {
    const { name, barcode, brand } = req.body as ProductInput;
    const { quantity, costCents, sellCents } = req.body as {
      quantity?: number;
      costCents?: number;
      sellCents?: number;
    };

    if (!name || !name.trim()) {
      return res.status(400).json({ error: "name is required" });
    }

    const supplierId = parseSupplierId(req.body.supplierId);
    const effectiveFrom = parseEffectiveFrom(req.body.effectiveFrom);

    if (quantity !== undefined && quantity !== null) {
      if (!Number.isInteger(quantity)) {
        throw new InvalidInput("quantity must be a whole number");
      }
      if (quantity < 0) {
        throw new InvalidInput("quantity cannot be negative");
      }
    }

    const cost =
      costCents === undefined || costCents === null
        ? null
        : parseMoneyCents(costCents, "costCents");
    const sell =
      sellCents === undefined || sellCents === null
        ? null
        : parseMoneyCents(sellCents, "sellCents");

    if (supplierId !== null) {
      const supplier = await req.prisma.supplier.findUnique({
        where: { id: supplierId },
      });
      if (!supplier) {
        return res.status(404).json({ error: "Supplier not found" });
      }
    }

    /*
     * D1 has no interactive transactions, and the opening stock and prices need
     * the id the insert generates - so this cannot be expressed as one batch,
     * where every operation must be built before any of them runs.
     *
     * Instead the product is created first, then its opening rows go in a single
     * atomic batch. If that batch fails the product is deleted again, so the
     * original guarantee still holds: a product is never left half set up.
     */
    const product = await req.prisma.product.create({
      data: {
        name: name.trim(),
        barcode: barcode?.trim() || null,
        brand: brand?.trim() || null,
        supplierId,
      },
    });

    const openingWrites: Prisma.PrismaPromise<unknown>[] = [];

    if (quantity) {
      openingWrites.push(
        req.prisma.stockMovement.create({
          data: { productId: product.id, quantity, reason: "Starting stock" },
        })
      );
    }

    const openingPrices: Array<[PriceKind, number | null]> = [
      ["COST", cost],
      ["SELL", sell],
    ];

    for (const [kind, priceCents] of openingPrices) {
      if (priceCents !== null) {
        openingWrites.push(
          recordPrice(
            { productId: product.id, kind, priceCents, effectiveFrom },
            req.prisma
          )
        );
      }
    }

    if (openingWrites.length > 0) {
      try {
        await req.prisma.$transaction(openingWrites);
      } catch (err) {
        // Roll the product back by hand - there is no transaction to abort.
        await req.prisma.product
          .delete({ where: { id: product.id } })
          .catch(() => undefined);
        throw err;
      }
    }

    const [prices, currentStock] = await Promise.all([
      getLatestPrices(product.id, req.prisma),
      getCurrentStock(product.id, req.prisma),
    ]);

    res.status(201).json({ ...product, ...prices, currentStock });
  } catch (err) {
    if (err instanceof InvalidInput || isDuplicateBarcode(err)) {
      return respondToInputError(res, err, "Invalid product data");
    }
    console.error("Error creating product:", err);
    res.status(500).json({ error: "Internal server error" });
  }
};

/**
 * The list is the main inventory screen, so every row carries the three numbers
 * a shopkeeper actually looks for: how many are left, what it cost, and what it
 * sells for. Stock and prices are each resolved in one batched query.
 */
export const listProducts = async (req: Request, res: Response) => {
  try {
    const search = (req.query.search as string | undefined) ?? "";
    const brandFilter = (req.query.brand as string | undefined) ?? "";

    const where: Prisma.ProductWhereInput = {};

    if (search) {
      where.OR = [
        { name: { contains: search } },
        { barcode: { contains: search } },
        { brand: { contains: search } },
      ];
    }

    if (brandFilter) {
      where.brand = { equals: brandFilter };
    }

    const products = await loadProductsWithNumbers(
      req.prisma,
      Object.keys(where).length ? where : undefined
    );

    // Named filters, so the home screen's attention list can hand the user
    // straight to exactly the products a count referred to.
    const filter = req.query.filter as string | undefined;

    if (filter === "low") {
      return res.json(
        products
          .filter((p) => p.currentStock <= LOW_STOCK_THRESHOLD)
          .sort((a, b) => a.currentStock - b.currentStock)
      );
    }

    if (filter === "no-price") {
      return res.json(products.filter((p) => p.latestSell === null));
    }

    if (filter === "cost-rose") {
      const affected = await findCostRoseSincePriceSet(req.prisma);
      return res.json(products.filter((p) => affected.has(p.id)));
    }

    if (filter === "below-cost") {
      return res.json(
        products.filter(
          (p) =>
            p.latestSell !== null &&
            p.latestCost !== null &&
            p.latestSell.priceCents <= p.latestCost.priceCents
        )
      );
    }

    res.json(products);
  } catch (err) {
    console.error("Error fetching products:", err);
    res.status(500).json({ error: "Internal server error" });
  }
};

export const getProduct = async (req: Request, res: Response) => {
  try {
    const id = parseId(req.params.id);

    const product = await req.prisma.product.findUnique({
      where: { id },
      include: {
        supplier: true,
        priceHistory: {
          orderBy: [{ effectiveFrom: "desc" }, { id: "desc" }],
          take: 20,
        },
        stockMovements: {
          orderBy: { createdAt: "desc" },
          take: 20,
        },
      },
    });

    if (!product) {
      return res.status(404).json({ error: "Product not found" });
    }

    res.json(product);
  } catch (err) {
    console.error("Error fetching product:", err);
    res.status(400).json({ error: "Invalid product id" });
  }
};

export const updateProduct = async (req: Request, res: Response) => {
  try {
    const id = parseId(req.params.id);
    const { name, brand } = req.body as ProductInput;

    if (!name || !name.trim()) {
      return res.status(400).json({ error: "name is required" });
    }

    const supplierId = parseSupplierId(req.body.supplierId);

    // A barcode identifies a physical product, so it is only touched when the
    // caller actually sends the field. Omitting it leaves the existing barcode
    // alone rather than clearing it - losing one silently would break every
    // future scan of that product.
    const barcodeGiven = Object.prototype.hasOwnProperty.call(req.body, "barcode");
    const barcode = barcodeGiven
      ? (req.body.barcode as string | null)?.trim() || null
      : undefined;

    const product = await req.prisma.product.update({
      where: { id },
      data: {
        name: name.trim(),
        brand: brand?.trim() || null,
        supplierId,
        ...(barcode === undefined ? {} : { barcode }),
      },
    });

    res.json(product);
  } catch (err) {
    if (!(err instanceof InvalidInput) && !isDuplicateBarcode(err)) {
      console.error("Error updating product:", err);
    }
    respondToInputError(res, err, "Invalid product id or data");
  }
};

export const deleteProduct = async (req: Request, res: Response) => {
  try {
    const id = parseId(req.params.id);

    // Price entries and stock movements have no meaning without their product,
    // so they go with it. Without this the delete fails on the foreign key.
    await req.prisma.$transaction([
      req.prisma.priceHistory.deleteMany({ where: { productId: id } }),
      req.prisma.stockMovement.deleteMany({ where: { productId: id } }),
      req.prisma.product.delete({ where: { id } }),
    ]);

    res.status(204).send();
  } catch (err) {
    console.error("Error deleting product:", err);
    res.status(400).json({ error: "Invalid product id or in use" });
  }
};

export const getProductByBarcode = async (req: Request, res: Response) => {
  try {
    const { barcode } = req.params;

    const product = await req.prisma.product.findUnique({
      where: { barcode },
      include: { supplier: true },
    });

    if (!product) {
      return res.status(404).json({ error: "Product not found" });
    }

    res.json(product);
  } catch (err) {
    console.error("Error looking up product by barcode:", err);
    res.status(500).json({ error: "Internal server error" });
  }
};

/**
 * Records a new dated price. `kind` picks the track: "COST" for what we pay the
 * supplier, "SELL" for what we charge. Earlier entries are kept as history.
 */
export const setProductPrice = async (req: Request, res: Response) => {
  try {
    const id = parseId(req.params.id);
    const { kind, priceCents, note } = req.body as {
      kind?: string;
      priceCents?: number;
      note?: string | null;
    };

    if (!isPriceKind(kind)) {
      return res.status(400).json({ error: 'kind must be "COST" or "SELL"' });
    }

    const cents = parseMoneyCents(priceCents, "priceCents");
    const effectiveFrom = parseEffectiveFrom(req.body.effectiveFrom);

    const product = await req.prisma.product.findUnique({ where: { id } });
    if (!product) {
      return res.status(404).json({ error: "Product not found" });
    }

    const price = await recordPrice(
      {
        productId: id,
        kind,
        priceCents: cents,
        note: note?.trim() || null,
        effectiveFrom,
      },
      req.prisma
    );

    res.status(201).json(price);
  } catch (err) {
    if (!(err instanceof InvalidInput)) {
      console.error("Error setting price:", err);
    }
    respondToInputError(res, err, "Invalid product id or data");
  }
};

/** Full dated price history. Pass `?kind=COST` or `?kind=SELL` to narrow it. */
export const getPriceHistory = async (req: Request, res: Response) => {
  try {
    const id = parseId(req.params.id);
    const kind = req.query.kind;

    if (kind !== undefined && !isPriceKind(kind)) {
      return res.status(400).json({ error: 'kind must be "COST" or "SELL"' });
    }

    const history = await req.prisma.priceHistory.findMany({
      where: { productId: id, ...(kind ? { kind } : {}) },
      orderBy: [{ effectiveFrom: "desc" }, { id: "desc" }],
    });

    res.json(history);
  } catch (err) {
    console.error("Error fetching price history:", err);
    res.status(400).json({ error: "Invalid product id" });
  }
};

export const adjustStock = async (req: Request, res: Response) => {
  try {
    const id = parseId(req.params.id);
    const { quantity, reason } = req.body as {
      quantity?: number;
      reason?: string;
    };

    if (!Number.isInteger(quantity) || quantity === 0) {
      return res
        .status(400)
        .json({ error: "quantity must be a non-zero whole number" });
    }

    if (!reason || !reason.trim()) {
      return res.status(400).json({ error: "reason is required" });
    }

    const product = await req.prisma.product.findUnique({ where: { id } });
    if (!product) {
      return res.status(404).json({ error: "Product not found" });
    }

    const movement = await req.prisma.stockMovement.create({
      data: {
        productId: id,
        quantity: quantity!,
        reason: reason.trim(),
      },
    });

    res.status(201).json({
      movement,
      currentStock: await getCurrentStock(id, req.prisma),
    });
  } catch (err) {
    console.error("Error adjusting stock:", err);
    res.status(400).json({ error: "Invalid product id or data" });
  }
};

export const getProductSummary = async (req: Request, res: Response) => {
  try {
    const id = parseId(req.params.id);

    const product = await req.prisma.product.findUnique({
      where: { id },
      include: { supplier: true },
    });

    if (!product) {
      return res.status(404).json({ error: "Product not found" });
    }

    const [prices, currentStock, recentMovements] = await Promise.all([
      getLatestPrices(id, req.prisma),
      getCurrentStock(id, req.prisma),
      req.prisma.stockMovement.findMany({
        where: { productId: id },
        orderBy: [{ createdAt: "desc" }, { id: "desc" }],
        take: 10,
      }),
    ]);

    res.json({ product, ...prices, currentStock, recentMovements });
  } catch (err) {
    console.error("Error fetching product summary:", err);
    res.status(400).json({ error: "Invalid product id" });
  }
};
