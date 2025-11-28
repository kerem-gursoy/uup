import { Request, Response } from "express";
import { prisma } from "../lib/prisma";
import { parseId } from "../utils/parseId";

export const createProduct = async (req: Request, res: Response) => {
  try {
    const {
      name,
      barcode,
      brand,
      supplierId,
    } = req.body as {
      name?: string;
      barcode?: string | null;
      brand?: string | null;
      supplierId?: number | null;
    };

    if (!name) {
      return res.status(400).json({ error: "name is required" });
    }

    const product = await prisma.product.create({
      data: {
        name,
        barcode: barcode || null,
        brand: brand || null,
        supplierId: supplierId ?? null,
      },
    });

    res.status(201).json(product);
  } catch (err) {
    console.error("Error creating product:", err);
    res.status(500).json({ error: "Internal server error" });
  }
};

export const listProducts = async (req: Request, res: Response) => {
  try {
    const search = (req.query.search as string | undefined) ?? "";
    const brandFilter = (req.query.brand as string | undefined) ?? "";

    const where: Record<string, unknown> = {};

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

    const products = await prisma.product.findMany({
      where: Object.keys(where).length ? where : undefined,
      include: {
        supplier: true,
      },
      orderBy: { id: "asc" },
    });

    res.json(products);
  } catch (err) {
    console.error("Error fetching products:", err);
    res.status(500).json({ error: "Internal server error" });
  }
};

export const getProduct = async (req: Request, res: Response) => {
  try {
    const id = parseId(req.params.id);

    const product = await prisma.product.findUnique({
      where: { id },
      include: {
        supplier: true,
        priceHistory: {
          orderBy: { effectiveFrom: "desc" },
          take: 10,
        },
        stockMovements: {
          orderBy: { createdAt: "desc" },
          take: 10,
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
    const {
      name,
      barcode,
      brand,
      supplierId,
    } = req.body as {
      name?: string;
      barcode?: string | null;
      brand?: string | null;
      supplierId?: number | null;
    };

    if (!name) {
      return res.status(400).json({ error: "name is required" });
    }

    const product = await prisma.product.update({
      where: { id },
      data: {
        name,
        barcode: barcode || null,
        brand: brand || null,
        supplierId: supplierId ?? null,
      },
    });

    res.json(product);
  } catch (err) {
    console.error("Error updating product:", err);
    res.status(400).json({ error: "Invalid product id or data" });
  }
};

export const deleteProduct = async (req: Request, res: Response) => {
  try {
    const id = parseId(req.params.id);

    await prisma.product.delete({
      where: { id },
    });

    res.status(204).send();
  } catch (err) {
    console.error("Error deleting product:", err);
    res.status(400).json({ error: "Invalid product id or in use" });
  }
};

export const getProductByBarcode = async (req: Request, res: Response) => {
  try {
    const { barcode } = req.params;

    const product = await prisma.product.findUnique({
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

export const setProductPrice = async (req: Request, res: Response) => {
  try {
    const id = parseId(req.params.id);
    const { priceCents } = req.body as { priceCents?: number };

    if (!Number.isInteger(priceCents) || (priceCents as number) <= 0) {
      return res
        .status(400)
        .json({ error: "priceCents must be a positive integer (in cents)" });
    }

    const product = await prisma.product.findUnique({ where: { id } });
    if (!product) {
      return res.status(404).json({ error: "Product not found" });
    }

    const price = await prisma.priceHistory.create({
      data: {
        productId: id,
        priceCents: priceCents!,
      },
    });

    res.status(201).json(price);
  } catch (err) {
    console.error("Error setting price:", err);
    res.status(400).json({ error: "Invalid product id or data" });
  }
};

export const getPriceHistory = async (req: Request, res: Response) => {
  try {
    const id = parseId(req.params.id);

    const history = await prisma.priceHistory.findMany({
      where: { productId: id },
      orderBy: { effectiveFrom: "asc" },
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
        .json({ error: "quantity must be a non-zero integer" });
    }

    if (!reason) {
      return res.status(400).json({ error: "reason is required" });
    }

    const product = await prisma.product.findUnique({ where: { id } });
    if (!product) {
      return res.status(404).json({ error: "Product not found" });
    }

    const movement = await prisma.stockMovement.create({
      data: {
        productId: id,
        quantity: quantity!,
        reason,
      },
    });

    const aggregate = await prisma.stockMovement.aggregate({
      where: { productId: id },
      _sum: { quantity: true },
    });

    const currentStock = aggregate._sum.quantity ?? 0;

    res.status(201).json({
      movement,
      currentStock,
    });
  } catch (err) {
    console.error("Error adjusting stock:", err);
    res.status(400).json({ error: "Invalid product id or data" });
  }
};

export const getProductSummary = async (req: Request, res: Response) => {
  try {
    const id = parseId(req.params.id);

    const product = await prisma.product.findUnique({
      where: { id },
      include: {
        supplier: true,
      },
    });

    if (!product) {
      return res.status(404).json({ error: "Product not found" });
    }

    const latestPrice = await prisma.priceHistory.findFirst({
      where: { productId: id },
      orderBy: { effectiveFrom: "desc" },
    });

    const aggregate = await prisma.stockMovement.aggregate({
      where: { productId: id },
      _sum: { quantity: true },
    });
    const currentStock = aggregate._sum.quantity ?? 0;

    res.json({
      product,
      latestPrice,
      currentStock,
    });
  } catch (err) {
    console.error("Error fetching product summary:", err);
    res.status(400).json({ error: "Invalid product id" });
  }
};
