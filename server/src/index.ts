import express from "express";
import cors from "cors";
import { check } from "./controllers/system";
import {
  createSupplier,
  deleteSupplier,
  getSupplier,
  listSuppliers,
  updateSupplier,
} from "./controllers/suppliers";
import {
  adjustStock,
  createProduct,
  deleteProduct,
  getPriceHistory,
  getProduct,
  getProductByBarcode,
  getProductSummary,
  listProducts,
  setProductPrice,
  updateProduct,
} from "./controllers/products";
import { invoiceUpload, uploadInvoice } from "./controllers/invoices";


const app = express();

app.use(cors());
app.use(express.json());

const PORT = process.env.PORT || 3000;

app.get("/", check);

app.post("/suppliers", createSupplier);
app.get("/suppliers", listSuppliers);
app.get("/suppliers/:id", getSupplier);
app.put("/suppliers/:id", updateSupplier);
app.delete("/suppliers/:id", deleteSupplier);

app.post("/products", createProduct);
app.get("/products", listProducts);
app.get("/products/by-barcode/:barcode", getProductByBarcode);
app.get("/products/:id", getProduct);
app.put("/products/:id", updateProduct);
app.delete("/products/:id", deleteProduct);

app.post("/products/:id/set-price", setProductPrice);
app.get("/products/:id/price-history", getPriceHistory);
app.post("/products/:id/adjust-stock", adjustStock);
app.get("/products/:id/summary", getProductSummary);

app.post("/invoices/upload", invoiceUpload.single("file"), uploadInvoice);

app.listen(PORT, () => {
  console.log(`Server listening on http://localhost:${PORT}`);
});
