// models/document.js (ESM)
import mongoose from "mongoose";

const { Schema, Types } = mongoose;

/**
 * Multitenancy model (no Tenant collection):
 * - orgId => the organization owner’s _id (Admin user). For solo lawyers, orgId === user._id.
 * - uploadedBy => the user who uploaded (admin or lawyer).
 */
const DocumentSchema = new Schema(
  {
    // Per-organization scoping
    orgId: { type: Types.ObjectId, ref: "User", required: true, index: true },

    // Core links
    caseId: { type: Types.ObjectId, ref: "Case", required: true, index: true },

    // Document kind
    documentType: {
      type: String,
      enum: [
        "POA",
        "Petition",
        "Reply",
        "Evidence",
        "Interim Order",
        "Testimonial",
        "District Judgment",
        "High Court Appeal",
        "High Court Judgment",
        "Supreme Court Appeal",
        "Supreme Court Judgment"
      ],
      required: true,
      index: true
    },

    // Who uploaded
    uploadedBy: { type: Types.ObjectId, ref: "User", required: true, index: true },
    originalFilename: { type: String },

    // ---- STORAGE ----
    storage: {
      provider: { type: String, enum: ["s3", "minio", "gcs", "gridfs", "local"], default: "s3" },
      bucket: { type: String },
      key: { type: String },                // e.g., cases/<caseId>/<docId>/original.pdf
      mimeType: { type: String },
      sizeBytes: { type: Number },
      pages: { type: Number },
      sha256: { type: String }              // used for dedupe/integrity
    },

    // Legacy path (kept for backward compatibility)
    filePath: { type: String },

    // Original metadata (prefer storage.*)
    metadata: {
      pages: Number,
      fileSize: Number,
      fileType: String // PDF, JPG, PNG
    },

    // Language hints for Nepali OCR
    language: {
      iso: { type: String, default: "ne" },
      script: { type: String, default: "Devanagari" },
      mixed: { type: Boolean, default: true }
    },

    // Versioning
    version: { type: Number, default: 1 },

    // Source info
    source: {
      ingest: { type: String, enum: ["upload", "email", "scan", "api"], default: "upload" }
    },

    // Optional exhibit info
    exhibit: {
      no: { type: String },  // e.g., "Exh-1"
      title: { type: String }
    },

    // ---- OCR PIPELINE ----
    ocrJob: { type: Types.ObjectId, ref: "OcrJob" },
    ocr: {
      status: {
        type: String,
        enum: ["pending", "running", "completed", "failed"],
        default: "pending",
        index: true
      },
      engine: { type: String },                 // e.g., "tesseract-5.4-nep+eng"
      avgConfidence: { type: Number, min: 0, max: 1 },
      perPage: [{ page: Number, confidence: Number }],
      textDocId: { type: Types.ObjectId, ref: "DocumentText" }, // link to extracted text
      needsReview: { type: Boolean, default: false },
      normalizationVersion: { type: String, default: "v1" }
    },

    // Optional soft-delete
    deletedAt: { type: Date, default: null }
  },
  {
    timestamps: { createdAt: "createdAt", updatedAt: "updatedAt" }
  }
);

/* ===================== Validators & hooks ===================== */

// ✅ Validate nested requirement safely (either storage.key or filePath)
DocumentSchema.pre("validate", function (next) {
  const hasKey = !!this.storage?.key;
  const hasLegacy = !!this.filePath;
  if (!hasKey && !hasLegacy) {
    this.invalidate("storage.key", "Either storage.key or filePath is required");
  }
  next();
});

// Auto-flag needsReview on low OCR confidence & sync metadata to storage
DocumentSchema.pre("save", function (next) {
  if (typeof this.ocr?.avgConfidence === "number") {
    this.ocr.needsReview = this.ocr.avgConfidence < 0.85;
  }
  if (!this.storage?.pages && this.metadata?.pages) {
    this.storage ??= {};
    this.storage.pages = this.metadata.pages;
  }
  if (!this.storage?.sizeBytes && this.metadata?.fileSize) {
    this.storage ??= {};
    this.storage.sizeBytes = this.metadata.fileSize;
  }
  next();
});

/* ========================= Indexes ========================= */

// Typical dashboards & queues (scoped by org)
DocumentSchema.index({ orgId: 1, caseId: 1, documentType: 1, createdAt: -1 });
DocumentSchema.index({ orgId: 1, "ocr.status": 1, createdAt: -1 });
DocumentSchema.index({ uploadedBy: 1, createdAt: -1 });

// Dedupe per org (sparse allows null sha256)
DocumentSchema.index(
  { orgId: 1, "storage.sha256": 1 },
  { unique: true, sparse: true }
);

// Fast “recent docs” queries
DocumentSchema.index({ orgId: 1, createdAt: -1 });

export default mongoose.model("Document", DocumentSchema);
