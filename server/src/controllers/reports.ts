import { Request, Response } from "express";
import {
  findCostRoseSincePriceSet,
  loadProductsWithNumbers,
  LOW_STOCK_THRESHOLD,
} from "../services/inventory.js";
const RECENT_ACTIVITY_LIMIT = 8;

type ActivityEntry = {
  id: string;
  type: "STOCK" | "PRICE";
  productId: number;
  productName: string;
  /** Human-readable change, e.g. "+12" or the new price in cents. */
  quantity: number | null;
  priceCents: number | null;
  priceKind: string | null;
  detail: string;
  at: Date;
};

/**
 * A merged feed of the two things that change in this system: stock moving and
 * prices being set. Gives the home screen a real answer to "what happened
 * recently?" instead of a static placeholder.
 */
export const getRecentActivity = async (req: Request, res: Response) => {
  try {
    const [movements, prices] = await Promise.all([
      req.prisma.stockMovement.findMany({
        orderBy: { createdAt: "desc" },
        take: RECENT_ACTIVITY_LIMIT,
        include: { product: { select: { id: true, name: true } } },
      }),
      req.prisma.priceHistory.findMany({
        orderBy: [{ effectiveFrom: "desc" }, { id: "desc" }],
        take: RECENT_ACTIVITY_LIMIT,
        include: { product: { select: { id: true, name: true } } },
      }),
    ]);

    const entries: ActivityEntry[] = [
      ...movements.map((movement) => ({
        id: `stock-${movement.id}`,
        type: "STOCK" as const,
        productId: movement.product.id,
        productName: movement.product.name,
        quantity: movement.quantity,
        priceCents: null,
        priceKind: null,
        detail: movement.reason,
        at: movement.createdAt,
      })),
      ...prices.map((price) => ({
        id: `price-${price.id}`,
        type: "PRICE" as const,
        productId: price.product.id,
        productName: price.product.name,
        quantity: null,
        priceCents: price.priceCents,
        priceKind: price.kind,
        detail: price.note ?? "",
        at: price.effectiveFrom,
      })),
    ]
      .sort((a, b) => b.at.getTime() - a.at.getTime())
      .slice(0, RECENT_ACTIVITY_LIMIT);

    res.json(entries);
  } catch (err) {
    console.error("Error building recent activity:", err);
    res.status(500).json({ error: "Internal server error" });
  }
};

/**
 * What needs attention, as counts.
 *
 * This is what the home screen opens with, so it answers one question: what
 * should someone deal with today? Each count is a number the app can already
 * derive - nothing here needed a schema change.
 */
export const getAttention = async (req: Request, res: Response) => {
  try {
    const [products, costRose, invoicesToReview] = await Promise.all([
      loadProductsWithNumbers(req.prisma),
      findCostRoseSincePriceSet(req.prisma),
      req.prisma.invoice.count({ where: { status: { not: "APPLIED" } } }),
    ]);

    const outOfStock = products.filter((p) => p.currentStock <= 0).length;
    const runningLow = products.filter(
      (p) => p.currentStock > 0 && p.currentStock <= LOW_STOCK_THRESHOLD
    ).length;

    res.json({
      lowStock: outOfStock + runningLow,
      outOfStock,
      invoicesToReview,
      missingSellPrice: products.filter((p) => p.latestSell === null).length,
      costRoseSincePriceSet: costRose.size,
      /** Products priced at or below what they cost - money lost on every sale. */
      sellingBelowCost: products.filter(
        (p) =>
          p.latestSell !== null &&
          p.latestCost !== null &&
          p.latestSell.priceCents <= p.latestCost.priceCents
      ).length,
      lowStockThreshold: LOW_STOCK_THRESHOLD,
    });
  } catch (err) {
    console.error("Error building attention report:", err);
    res.status(500).json({ error: "Internal server error" });
  }
};
