import { Request, Response } from "express";
import type { PrismaClient } from "@prisma/client";

type SupplierDependencies = {
  prisma: PrismaClient;
  parseId: (value: string) => number;
};

export const createSuppliersController = ({
  prisma,
  parseId,
}: SupplierDependencies) => {
  const createSupplier = async (req: Request, res: Response) => {
    try {
      const { name } = req.body as { name?: string };

      if (!name) {
        return res.status(400).json({ error: "name is required" });
      }

      const supplier = await prisma.supplier.create({
        data: { name },
      });

      res.status(201).json(supplier);
    } catch (err) {
      console.error("Error creating supplier:", err);
      res.status(500).json({ error: "Internal server error" });
    }
  };

  const listSuppliers = async (_req: Request, res: Response) => {
    try {
      const suppliers = await prisma.supplier.findMany({
        orderBy: { name: "asc" },
      });
      res.json(suppliers);
    } catch (err) {
      console.error("Error fetching suppliers:", err);
      res.status(500).json({ error: "Internal server error" });
    }
  };

  const getSupplier = async (req: Request, res: Response) => {
    try {
      const id = parseId(req.params.id);

      const supplier = await prisma.supplier.findUnique({
        where: { id },
        include: { products: true },
      });

      if (!supplier) {
        return res.status(404).json({ error: "Supplier not found" });
      }

      res.json(supplier);
    } catch (err) {
      console.error("Error fetching supplier:", err);
      res.status(400).json({ error: "Invalid supplier id" });
    }
  };

  const updateSupplier = async (req: Request, res: Response) => {
    try {
      const id = parseId(req.params.id);
      const { name } = req.body as { name?: string };

      if (!name) {
        return res.status(400).json({ error: "name is required" });
      }

      const supplier = await prisma.supplier.update({
        where: { id },
        data: { name },
      });

      res.json(supplier);
    } catch (err) {
      console.error("Error updating supplier:", err);
      res.status(400).json({ error: "Invalid supplier id or data" });
    }
  };

  const deleteSupplier = async (req: Request, res: Response) => {
    try {
      const id = parseId(req.params.id);

      await prisma.supplier.delete({
        where: { id },
      });

      res.status(204).send();
    } catch (err) {
      console.error("Error deleting supplier:", err);
      res.status(400).json({ error: "Invalid supplier id or in use" });
    }
  };

  return {
    createSupplier,
    listSuppliers,
    getSupplier,
    updateSupplier,
    deleteSupplier,
  };
};
