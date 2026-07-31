import type { Prisma } from "@prisma/client";
import type { AppPrisma } from "../lib/prisma.js";
import { ApplyInvoiceRequest } from "./invoiceTypes.js";
import { recordPrice } from "./inventory.js";

/**
 * A rejected request rather than a server fault, carrying the status the
 * controller should answer with.
 *
 * The status travels with the error because the alternative - matching on
 * message text - silently misclassified anything whose wording drifted. Two of
 * the four validation failures below ("Quantity must be non-zero...", "Product
 * not found...") did not begin with "Invalid", so a user who picked a
 * since-deleted product got a blank 500 instead of a message naming the line.
 */
export class InvoiceApplyError extends Error {
  readonly status: number;

  constructor(message: string, status: number) {
    super(message);
    this.name = "InvoiceApplyError";
    this.status = status;
  }
}

const requireIntegerQuantity = (value: number | null, lineLabel: string) => {
  if (!Number.isInteger(value as number)) {
    throw new InvoiceApplyError(`Invalid quantity for ${lineLabel}`, 400);
  }
  const intValue = value as number;
  if (intValue === 0) {
    throw new InvoiceApplyError(`Quantity must be non-zero for ${lineLabel}`, 400);
  }
  return intValue;
};

const requireUnitPriceCents = (value: number | null, lineLabel: string) => {
  if (!Number.isFinite(value as number) || (value as number) <= 0) {
    throw new InvoiceApplyError(`Invalid unitPrice for ${lineLabel}`, 400);
  }
  const cents = Math.round((value as number) * 100);
  if (cents <= 0) {
    throw new InvoiceApplyError(`Invalid unitPrice for ${lineLabel}`, 400);
  }
  return cents;
};

/**
 * Applies a reviewed invoice: stock movements and cost updates for each accepted
 * line, then marks the invoice APPLIED.
 *
 * Structured in two distinct passes because D1 has no interactive transactions.
 * The old shape - `$transaction(async (tx) => ...)` with reads interleaved
 * between writes - is not supported by the D1 adapter at all, so:
 *
 *   Pass 1  validate, using ordinary reads. Nothing is written, so reading
 *           outside a transaction is safe: the worst case is that validation
 *           races another writer, which for a single-tenant shop tool applying
 *           an invoice by hand is not a real scenario.
 *   Pass 2  build every write un-awaited and submit them together.
 *
 * Note what pass 2 does NOT buy. `@prisma/adapter-d1` logs, on every call, that
 * it does not implement transactions and runs the array as individual queries -
 * so the batch is a grouping, not an atomic commit, and a failure midway leaves
 * the earlier writes in place.
 *
 * Pass 1 is therefore the real safeguard rather than a convenience: every
 * condition this function rejects is checked before a single write is issued, so
 * a bad line writes nothing. What remains uncovered is an infrastructure failure
 * partway through pass 2, which would need the invoice to be re-checked by hand.
 * Accepted deliberately: the alternative is compensating logic whose own failure
 * modes are worse than the one it guards against, for a tool where one person
 * applies one invoice at a time.
 */
export const applyInvoice = async (
  client: AppPrisma,
  invoiceId: number,
  payload: ApplyInvoiceRequest
) => {
  // ---- Pass 1: validate everything before writing anything ----
  const invoice = await client.invoice.findUnique({ where: { id: invoiceId } });

  if (!invoice) {
    throw new InvoiceApplyError("Invoice not found", 404);
  }
  if (invoice.status === "APPLIED") {
    throw new InvoiceApplyError("Invoice already applied", 409);
  }

  const lines = payload.lines ?? [];
  const accepted = lines.filter(
    (line) => line.apply && line.productId !== null
  );
  const skippedLines = lines.length - accepted.length;

  // One query for every referenced product rather than one per line - the old
  // per-line `findUnique` inside the transaction is exactly what D1 disallows.
  const productIds = [...new Set(accepted.map((line) => line.productId!))];
  const found = await client.product.findMany({
    where: { id: { in: productIds } },
    select: { id: true },
  });
  const known = new Set(found.map((product) => product.id));

  // Heterogeneous on purpose: stock movements, price upserts and the invoice
  // update all go into one batch, so the element type is the common PrismaPromise.
  const writes: Prisma.PrismaPromise<unknown>[] = [];

  for (const line of accepted) {
    const label = `line ${line.parsedLineNo ?? line.lineIndex}`;
    const productId = line.productId!;

    if (!known.has(productId)) {
      throw new InvoiceApplyError(`Product not found for ${label}`, 400);
    }

    if (line.applyStock) {
      const quantity = requireIntegerQuantity(line.quantity, label);
      writes.push(
        client.stockMovement.create({
          data: {
            productId,
            quantity,
            reason: `Invoice ${invoiceId} ${label}`,
          },
        })
      );
    }

    if (line.applyPrice) {
      const priceCents = requireUnitPriceCents(line.unitPrice, label);
      // An invoice states what the supplier charged us, so it updates the cost
      // track. The selling price stays under the shop's control.
      writes.push(
        recordPrice(
          {
            productId,
            kind: "COST",
            priceCents,
            note: `Invoice ${invoiceId}`,
          },
          client
        )
      );
    }
  }

  // ---- Pass 2: commit atomically ----
  writes.push(
    client.invoice.update({
      where: { id: invoiceId },
      data: { status: "APPLIED" },
    })
  );

  await client.$transaction(writes);

  return {
    invoiceId,
    appliedLines: accepted.length,
    skippedLines,
  };
};
