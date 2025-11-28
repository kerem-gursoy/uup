import express from "express";
import cors from "cors";
import { PrismaClient } from "@prisma/client";
import { check } from "./controllers/system";
import { createSuppliersController } from "./controllers/suppliers";
import { createProductsController } from "./controllers/products";

const app = express();
const prisma = new PrismaClient();

const parseId = (value: string) => {
  const id = Number(value);
  if (Number.isNaN(id) || id <= 0) {
    throw new Error("Invalid ID");
  }
  return id;
};

const suppliersController = createSuppliersController({ prisma, parseId });
const productsController = createProductsController({ prisma, parseId });

app.use(cors());
app.use(express.json());

const PORT = process.env.PORT || 3000;

app.get("/", check);

app.post("/suppliers", suppliersController.createSupplier);
app.get("/suppliers", suppliersController.listSuppliers);
app.get("/suppliers/:id", suppliersController.getSupplier);
app.put("/suppliers/:id", suppliersController.updateSupplier);
app.delete("/suppliers/:id", suppliersController.deleteSupplier);

app.post("/products", productsController.createProduct);
app.get("/products", productsController.listProducts);
app.get("/products/by-barcode/:barcode", productsController.getProductByBarcode);
app.get("/products/:id", productsController.getProduct);
app.put("/products/:id", productsController.updateProduct);
app.delete("/products/:id", productsController.deleteProduct);

app.post("/products/:id/set-price", productsController.setProductPrice);
app.get("/products/:id/price-history", productsController.getPriceHistory);
app.post("/products/:id/adjust-stock", productsController.adjustStock);
app.get("/products/:id/summary", productsController.getProductSummary);

app.listen(PORT, () => {
  console.log(`Server listening on http://localhost:${PORT}`);
});
