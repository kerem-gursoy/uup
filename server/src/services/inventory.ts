import { Prisma } from "@prisma/client";

/**
 * At or below this many units, a product counts as running low. One definition,
 * so the home screen's count and the product filter can never disagree.
 */
export const LOW_STOCK_THRESHOLD = 5;

/**
 * A product has two independent, dated price tracks:
 *   COST - what we pay the supplier
 *   SELL - what we charge the customer
 * Neither is ever overwritten; setting a price appends a new dated entry.
 */
export const PRICE_KINDS = ["COST", "SELL"] as const;
export type PriceKind = (typeof PRICE_KINDS)[number];

export const isPriceKind = (value: unknown): value is PriceKind =>
  typeof value === "string" && (PRICE_KINDS as readonly string[]).includes(value);

export type LatestPrices = {
  latestCost: LatestPriceRow | null;
  latestSell: LatestPriceRow | null;
};

type LatestPriceRow = {
  id: number;
  productId: number;
  kind: PriceKind;
  priceCents: number;
  note: string | null;
  effectiveFrom: Date;
};

const emptyPrices = (): LatestPrices => ({ latestCost: null, latestSell: null });

/**
 * Latest COST and SELL entry for every product, in a single query.
 *
 * Prisma has no "latest row per group", so this uses a window function over
 * the ([productId, kind, effectiveFrom]) index. Ties on effectiveFrom are
 * broken by id so the most recently written entry always wins.
 */
export const getLatestPricesByProduct = async (
  client: Prisma.TransactionClient
): Promise<Map<number, LatestPrices>> => {
  const rows = await client.$queryRaw<LatestPriceRow[]>`
    SELECT id, productId, kind, priceCents, note, effectiveFrom
    FROM (
      SELECT
        id, productId, kind, priceCents, note, effectiveFrom,
        ROW_NUMBER() OVER (
          PARTITION BY productId, kind
          ORDER BY effectiveFrom DESC, id DESC
        ) AS rowNumber
      FROM PriceHistory
    )
    WHERE rowNumber = 1
  `;

  const byProduct = new Map<number, LatestPrices>();

  for (const row of rows) {
    const entry = byProduct.get(row.productId) ?? emptyPrices();
    // Raw queries bypass Prisma's type mapping, so dates arrive as epoch millis.
    const price: LatestPriceRow = {
      ...row,
      effectiveFrom: new Date(row.effectiveFrom),
    };

    if (row.kind === "COST") {
      entry.latestCost = price;
    } else if (row.kind === "SELL") {
      entry.latestSell = price;
    }

    byProduct.set(row.productId, entry);
  }

  return byProduct;
};

export const getLatestPrices = async (
  productId: number,
  client: Prisma.TransactionClient
): Promise<LatestPrices> => {
  const [latestCost, latestSell] = await Promise.all(
    PRICE_KINDS.map((kind) =>
      client.priceHistory.findFirst({
        where: { productId, kind },
        orderBy: [{ effectiveFrom: "desc" }, { id: "desc" }],
      })
    )
  );

  return {
    latestCost: (latestCost as LatestPriceRow) ?? null,
    latestSell: (latestSell as LatestPriceRow) ?? null,
  };
};

/** Current stock for every product that has ever moved, in a single query. */
export const getStockByProduct = async (
  client: Prisma.TransactionClient
): Promise<Map<number, number>> => {
  const totals = await client.stockMovement.groupBy({
    by: ["productId"],
    _sum: { quantity: true },
  });

  return new Map(totals.map((row) => [row.productId, row._sum.quantity ?? 0]));
};

export const getCurrentStock = async (
  productId: number,
  client: Prisma.TransactionClient
): Promise<number> => {
  const aggregate = await client.stockMovement.aggregate({
    where: { productId },
    _sum: { quantity: true },
  });

  return aggregate._sum.quantity ?? 0;
};

/**
 * Every product with the three numbers that describe it: how many are on hand,
 * what it costs, and what it sells for.
 *
 * One place, because the product list and every report needs exactly this, and
 * each of them needs it batched rather than per-product.
 */
export const loadProductsWithNumbers = async (
  client: Prisma.TransactionClient,
  where?: Prisma.ProductWhereInput
) => {
  const [products, stockByProduct, pricesByProduct] = await Promise.all([
    client.product.findMany({
      where,
      include: { supplier: true },
      orderBy: { name: "asc" },
    }),
    getStockByProduct(client),
    getLatestPricesByProduct(client),
  ]);

  return products.map((product) => ({
    ...product,
    currentStock: stockByProduct.get(product.id) ?? 0,
    latestCost: pricesByProduct.get(product.id)?.latestCost ?? null,
    latestSell: pricesByProduct.get(product.id)?.latestSell ?? null,
  }));
};

export type ProductWithNumbers = Awaited<
  ReturnType<typeof loadProductsWithNumbers>
>[number];

/**
 * Products whose cost has changed since the selling price was last set.
 *
 * This is the quiet one: a supplier raises their price, the invoice is applied,
 * and the shop keeps charging the old amount for months. Detectable only because
 * cost and selling price are separate dated tracks - it compares the current
 * cost against whatever the cost was on the day the price was decided.
 */
export const findCostRoseSincePriceSet = async (
  client: Prisma.TransactionClient
): Promise<Set<number>> => {
  const entries = await client.priceHistory.findMany({
    orderBy: [{ effectiveFrom: "asc" }, { id: "asc" }],
  });

  const costs = new Map<number, Array<{ at: number; cents: number }>>();
  const sells = new Map<number, { at: number; cents: number }>();

  for (const entry of entries) {
    const point = { at: entry.effectiveFrom.getTime(), cents: entry.priceCents };
    if (entry.kind === "COST") {
      const list = costs.get(entry.productId) ?? [];
      list.push(point);
      costs.set(entry.productId, list);
    } else if (entry.kind === "SELL") {
      // Ascending order means the last one wins, which is the latest.
      sells.set(entry.productId, point);
    }
  }

  const affected = new Set<number>();

  for (const [productId, sell] of sells) {
    const history = costs.get(productId);
    if (!history?.length) continue;

    const latestCost = history[history.length - 1]!;

    // What the product cost on the day the selling price was decided.
    let costWhenPriced: number | null = null;
    for (const point of history) {
      if (point.at <= sell.at) costWhenPriced = point.cents;
      else break;
    }

    if (costWhenPriced !== null && latestCost.cents > costWhenPriced) {
      affected.add(productId);
    }
  }

  return affected;
};

/**
 * Append a dated price entry.
 *
 * Two entries for the same product, kind and instant collide on the unique
 * constraint. That only happens when the same price is saved twice in the same
 * millisecond, or when a user re-enters a backdated price for a date they
 * already recorded - in both cases the newest value is a correction, so it
 * replaces the existing entry rather than failing.
 */
/**
 * Deliberately NOT async: it returns the PrismaPromise unawaited, so the same
 * function serves both `await recordPrice(...)` and D1's batch
 * `$transaction([...])`, which needs un-awaited operations. Marking it `async`
 * would wrap the result in a native promise that the batch form rejects.
 */
export const recordPrice = (
  input: {
    productId: number;
    kind: PriceKind;
    priceCents: number;
    note?: string | null;
    effectiveFrom?: Date;
  },
  client: Prisma.TransactionClient
) => {
  const { productId, kind, priceCents, note = null } = input;
  const effectiveFrom = input.effectiveFrom ?? new Date();

  return client.priceHistory.upsert({
    where: {
      productId_kind_effectiveFrom: { productId, kind, effectiveFrom },
    },
    create: { productId, kind, priceCents, note, effectiveFrom },
    update: { priceCents, note },
  });
};
