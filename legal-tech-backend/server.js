import cookieParser from "cookie-parser";
import cors from "cors";
import dotenv from "dotenv";
import express from "express";
import rateLimit from "express-rate-limit";
import helmet from "helmet";
import mongoose from "mongoose";
import path from "path";

// auth guard
import { requireAuth } from "./security/auth.js";

// Routes
import casesRouter from "./routes/caseRoutes.js";
import documentsRouter from "./routes/documentRoutes.js";
import ocrRouter from "./routes/ocrRoutes.js";
import usersRouter from "./routes/userRoutes.js";

dotenv.config();

const app = express();
const PORT = process.env.PORT || 5000;
const MONGO_URI = process.env.MONGO_URI || "mongodb://127.0.0.1:27017/nep-legal-tech";
const CORS_ORIGIN = process.env.CORS_ORIGIN || true; // e.g., "http://localhost:5173"

// --- Security & core middleware ---
app.set("trust proxy", 1);
app.use(helmet());
app.use(cors({ origin: CORS_ORIGIN, credentials: true }));
app.use(cookieParser());
app.use(express.json({ limit: "10mb" }));
app.use(express.urlencoded({ extended: true }));

// static for local uploads
app.use("/uploads", express.static(path.resolve("uploads")));

// --- Health ---
app.get("/", (_req, res) => res.send("Legal Tech Backend is running!"));
app.get("/healthz", (_req, res) => {
  const db = mongoose.connection.readyState; // 1=connected
  res.json({ ok: true, dbConnected: db === 1 });
});

// --- Rate limit for login ---
const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 100,
  standardHeaders: true,
  legacyHeaders: false,
});
app.use("/api/auth/login", loginLimiter);

// --- Public routes (no auth) ---
app.use("/api", usersRouter); // contains /auth/login (public) and /tenants
// If you want only /auth/login and POST /tenants public, move requireAuth into usersRouter per-route,
// or do a small public-only subrouter for those endpoints.

// --- Protected routes ---
app.use("/api", requireAuth, casesRouter);
app.use("/api", requireAuth, documentsRouter);
app.use("/api", requireAuth, ocrRouter);

// 404 handler
app.use((req, res) => res.status(404).json({ message: "Not found" }));

// Error handler
// eslint-disable-next-line no-unused-vars
app.use((err, _req, res, _next) => {
  console.error("Unhandled error:", err);
  res.status(500).json({ message: "Internal server error" });
});

// --- MongoDB connection ---
mongoose.set("strictQuery", true);
mongoose
  .connect(MONGO_URI)
  .then(() => {
    console.log("MongoDB connected");
    app.listen(PORT, () => console.log(`Server running on http://localhost:${PORT}`));
  })
  .catch((err) => {
    console.error("MongoDB connection error:", err);
    process.exit(1);
  });

// --- Graceful shutdown ---
async function shutdown(code = 0) {
  try {
    console.log("Shutting down gracefully...");
    await mongoose.connection.close();
  } catch (e) {
    console.error("Error during shutdown:", e);
  } finally {
    process.exit(code);
  }
}

process.on("SIGINT", () => shutdown(0));
process.on("SIGTERM", () => shutdown(0));

process.on("unhandledRejection", (reason) => {
  console.error("Unhandled Rejection:", reason);
});
process.on("uncaughtException", (err) => {
  console.error("Uncaught Exception:", err);
  shutdown(1);
});