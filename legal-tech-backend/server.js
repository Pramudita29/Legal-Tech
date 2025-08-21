// server.js (ESM)
import cors from "cors";
import dotenv from "dotenv";
import express from "express";
import mongoose from "mongoose";
import path from "path";

// Routes
import casesRouter from "./routes/caseRoutes.js";
import documentsRouter from "./routes/documentRoutes.js";
import ocrRouter from "./routes/ocrRoutes.js";
import usersRouter from "./routes/userRoutes.js";

dotenv.config();

const app = express();
const PORT = process.env.PORT || 5000;
const MONGO_URI = process.env.MONGO_URI || "mongodb://127.0.0.1:27017/nep-legal-tech";

// Middleware
app.use(cors());
app.use(express.json({ limit: "10mb" }));
app.use(express.urlencoded({ extended: true }));
app.use("/uploads", express.static(path.resolve("uploads")));

// Health
app.get("/", (_req, res) => res.send("Legal Tech Backend is running!"));
app.get("/healthz", (_req, res) => res.json({ ok: true }));

// Mount routes
app.use("/api", casesRouter);
app.use("/api", documentsRouter);
app.use("/api", ocrRouter);
app.use("/api", usersRouter);

// 404 handler
app.use((req, res) => res.status(404).json({ message: "Not found" }));

// Error handler
app.use((err, _req, res, _next) => {
  console.error("Unhandled error:", err);
  res.status(500).json({ message: "Internal server error" });
});

// MongoDB connection
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

// Graceful shutdown
process.on("SIGINT", async () => {
  console.log("Shutting down gracefully...");
  await mongoose.connection.close();
  process.exit(0);
});

process.on("unhandledRejection", (reason) => {
  console.error("Unhandled Rejection:", reason);
});

process.on("uncaughtException", (err) => {
  console.error("Uncaught Exception:", err);
  process.exit(1);
});
