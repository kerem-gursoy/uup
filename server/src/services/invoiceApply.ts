import type { Prisma } from "@prisma/client";
import type { AppPrisma } from "../lib/prisma.js";
import { ApplyInvoiceRequest } from "./invoiceTypes.js";
import { recordPrice } from "./inventory.js";

const requireIntegerQuantity = (value: number | null, lineLabel: string) => {
  if (!Number.isInteger(value as number)) {
    throw new Error(`Invalid quantity for ${lineLabel}`);
  }
  const intValue = value as number;
  if (intValue === 0) {
    throw new Error(`Quantity must be non-zero for ${lineLabel}`);
  }
  return intValue;
};

const requireUnitPriceCents = (value: number | null, lineLabel: string) => {
  if (!Number.isFinite(value as number) || (value as number) <= 0) {
    throw new Error(`Invalid unitPrice for ${lineLabel}`);
  }
  const cents = Math.round((value as number) * 100);
  if (cents <= 0) {
    throw new Error(`Invalid unitPrice for ${lineLabel}`);
  }
  return cents;
};

/**
 * Applies a reviewed invoice: stock movements and cost updates for each accepted
 * line, then marks the invoice APPLIED.
 *
 * Structured in two distinct passes because D1 has no interactive transactions.
 * The old shape - `$transaction(async (tx) => ...)` with reads interleaved
 * between writes - is not supported by the D1 adapter, which offers only atomic
 * execution of a pre-built array of operations. A naive port of that shape
 * compiles and then fails at runtime, so:
 *
 *   Pass 1  validate, using ordinary reads. Nothing is written, so reading
 *           outside a transaction is safe: the worst case is that validation
 *           races another writer, which for a single-tenant shop tool applying
 *           an invoice by hand is not a real scenario.
 *   Pass 2  build every write un-awaited, then hand the whole array to
 *           `$transaction([...])`, which D1 executes atomically.
 *
 * The guarantee that matters is preserved: if any line is invalid, the function
 * throws during pass 1 and NOT ONE write reaches the database.
 */
export const applyInvoice = async (
  client: AppPrisma,
  invoiceId: number,
  payload: ApplyInvoiceRequest
) => {
  // ---- Pass 1: validate everything before writing anything ----
  const invoice = await client.invoice.findUnique({ where: { id: invoiceId } });

  if (!invoice) {
    throw new Error("Invoice not found");
  }
  if (invoice.status === "APPLIED") {
    throw new Error("Invoice already applied");
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
      throw new Error(`Product not found for ${label}`);
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
