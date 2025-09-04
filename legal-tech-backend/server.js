// app.js (or server.js)
import cookieParser from "cookie-parser";
import cors from "cors";
import dotenv from "dotenv";
import express from "express";
import rateLimit from "express-rate-limit";
import helmet from "helmet";
import mongoose from "mongoose";
import path from "path";
import { fileURLToPath } from "url";

// auth guard
import { requireAuth } from "./security/auth.js";

// Routes
import casesRouter from "./routes/caseRoutes.js";
import documentsRouter from "./routes/documentRoutes.js";
import ocrRouter from "./routes/ocrRoutes.js";
import usersRouter from "./routes/userRoutes.js";
import calendarRouter from "./routes/calendarRoutes.js"; 

// mailer
import { initMailer } from "./services/mailer.js";

dotenv.config();

console.log("ENV check:", {
  user: process.env.GMAIL_USER,
  pass: process.env.GMAIL_APP_PASSWORD,
});


// Resolve __dirname for ESM
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT || 5000;
const MONGO_URI =
  process.env.MONGO_URI || "mongodb://127.0.0.1:27017/nep-legal-tech";

// Allow multiple origins via comma-separated env or boolean true
const CORS_ORIGIN = (() => {
  const v = process.env.CORS_ORIGIN;
  if (!v || v === "true") return true;
  if (v === "false") return false;
  // support "http://localhost:5173,http://localhost:3000"
  return v.split(",").map((s) => s.trim());
})();

// --- Security & core middleware ---
app.set("trust proxy", 1);
app.use(helmet());
app.use(
  cors({
    origin: CORS_ORIGIN,
    credentials: true,
  })
);
app.use(cookieParser());
app.use(express.json({ limit: "10mb" }));
app.use(express.urlencoded({ extended: true }));

// static for local uploads
app.use("/uploads", express.static(path.resolve(__dirname, "uploads")));

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
app.use("/api", usersRouter); // includes /auth/register-admin and /auth/login

// --- Protected routes ---
app.use("/api", requireAuth, casesRouter);
app.use("/api", requireAuth, documentsRouter);
app.use("/api", requireAuth, ocrRouter);
app.use("/api", requireAuth, calendarRouter); // <-- add this line


// 404 handler
app.use((req, res) => res.status(404).json({ message: "Not found" }));

// Error handler
// eslint-disable-next-line no-unused-vars
app.use((err, _req, res, _next) => {
  console.error("Unhandled error:", err);
  res.status(500).json({ message: "Internal server error" });
});

// --- MongoDB connection & mailer init ---
mongoose.set("strictQuery", true);

async function start() {
  try {
    await mongoose.connect(MONGO_URI);
    console.log("MongoDB connected");

    // init mail transport once (uses env Gmail creds)
    try {
      await initMailer();
      console.log("✉️  Mailer ready");
    } catch (e) {
      console.error("Mailer init failed:", e.message);
      // continue running API even if mailer fails in dev
    }

    app.listen(PORT, () =>
      console.log(`Server running on http://localhost:${PORT}`)
    );
  } catch (err) {
    console.error("Startup error:", err);
    process.exit(1);
  }
}
start();

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

export default app;
