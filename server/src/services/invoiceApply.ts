import { prisma } from "../lib/prisma";
import { ApplyInvoiceRequest } from "./invoiceTypes";

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

export const applyInvoice = async (
  invoiceId: number,
  payload: ApplyInvoiceRequest
) => {
  return prisma.$transaction(async (tx) => {
    const invoice = await tx.invoice.findUnique({
      where: { id: invoiceId },
    });

    if (!invoice) {
      throw new Error("Invoice not found");
    }

    if (invoice.status === "APPLIED") {
      throw new Error("Invoice already applied");
    }

    let appliedLines = 0;
    let skippedLines = 0;

    for (const line of payload.lines ?? []) {
      const label = `line ${line.parsedLineNo ?? line.lineIndex}`;

      if (!line.apply || line.productId === null) {
        skippedLines += 1;
        continue;
      }

      const product = await tx.product.findUnique({
        where: { id: line.productId },
      });

      if (!product) {
        throw new Error(`Product not found for ${label}`);
      }

      if (line.applyStock) {
        const quantity = requireIntegerQuantity(line.quantity, label);
        await tx.stockMovement.create({
          data: {
            productId: line.productId,
            quantity,
            reason: `Invoice ${invoiceId} ${label}`,
          },
        });
      }

      if (line.applyPrice) {
        const priceCents = requireUnitPriceCents(line.unitPrice, label);
        await tx.priceHistory.create({
          data: {
            productId: line.productId,
            priceCents,
            effectiveFrom: new Date(),
          },
        });
      }

      appliedLines += 1;
    }

    await tx.invoice.update({
      where: { id: invoiceId },
      data: { status: "APPLIED" },
    });

    return {
      invoiceId,
      appliedLines,
      skippedLines,
    };
  });
};
