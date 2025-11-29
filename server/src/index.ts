import express from "express";
import cors from "cors";
import cookieParser from "cookie-parser";
import 'dotenv/config'
import { check } from "./controllers/system";
import { login, logout, me, register } from "./controllers/auth";
import { requireAuth } from "./middleware/auth";
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
import {
  invoiceUpload,
  uploadInvoice,
  listInvoices,
  getInvoice,
  parseInvoice,
  applyParsedInvoice,
} from "./controllers/invoices";


const app = express();

app.use(cors({
  origin: ["http://localhost:5173", "http://127.0.0.1:5173"],
  credentials: true,
}));
app.use(express.json());
app.use(cookieParser());

const PORT = process.env.PORT || 3000;

app.get("/", check);

// Auth Routes
app.post("/auth/login", login);
app.post("/auth/logout", logout);
app.post("/auth/register", register);
app.get("/auth/me", me);

// Protected Routes
app.use(requireAuth);

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
app.get("/invoices", listInvoices);
app.get("/invoices/:id", getInvoice);
app.post("/invoices/:id/parse", parseInvoice);
app.post("/invoices/:id/apply", applyParsedInvoice);

app.listen(PORT, () => {
  console.log(`Server listening on http://localhost:${PORT}`);
});
