// models/document.js (ESM)
import mongoose from "mongoose";

const { Schema, Types } = mongoose;

const DocumentSchema = new Schema(
  {
    // Multi-tenant safety (optional but recommended)
    tenantId: { type: Types.ObjectId, ref: "Tenant", index: true },

    // Core links
    caseId: { type: Types.ObjectId, ref: "Case", required: true, index: true },

    // Keep your original documentType values for compatibility
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
    uploadedBy: { type: Types.ObjectId, ref: "User", required: true },

    // ---- STORAGE ----
    // Prefer structured storage; keep filePath for backward-compatibility.
    storage: {
      provider: { type: String, enum: ["s3", "minio", "gcs", "gridfs"], default: "s3" },
      bucket: { type: String },
      key: { type: String }, // e.g., cases/<caseId>/<docId>/original.pdf
      mimeType: { type: String },
      sizeBytes: { type: Number },
      pages: { type: Number },
      sha256: { type: String } // enable dedupe/integrity
    },

    // Deprecated but kept so old code doesn’t break; prefer storage.key
    filePath: { type: String },

    // Original metadata you had (kept, but storage.* is preferred)
    metadata: {
      pages: Number,
      fileSize: Number,
      fileType: String // PDF, JPG, PNG
    },

    // Language hints for Nepali OCR
    language: {
      iso: { type: String, default: "ne" },
      script: { type: String, default: "Devanagari" },
      mixed: { type: Boolean, default: true } // nep+eng common in practice
    },

    // Versioning (immutability-friendly)
    version: { type: Number, default: 1 },

    // Source info
    source: {
      ingest: { type: String, enum: ["upload", "email", "scan", "api"], default: "upload" }
    },

    // Optional exhibit info (for Evidence docs or when a PDF is an exhibit)
    exhibit: {
      no: { type: String }, // e.g., "Exh-1"
      title: { type: String }
    },

    // ---- OCR PIPELINE ----
    ocrJob: { type: Types.ObjectId, ref: "OcrJob" }, // your original link
    ocr: {
      status: {
        type: String,
        enum: ["pending", "running", "completed", "failed"],
        default: "pending",
        index: true
      },
      engine: { type: String },             // e.g., "tesseract-5.4-nep+eng"
      avgConfidence: { type: Number },      // 0..1
      perPage: [{ page: Number, confidence: Number }],
      textDocId: { type: Types.ObjectId, ref: "DocumentText" }, // link to extracted text
      needsReview: { type: Boolean, default: false }, // flag low-confidence OCR for QA
      normalizationVersion: { type: String, default: "v1" }     // track text normalization rules
    }
  },
  {
    timestamps: { createdAt: "createdAt", updatedAt: "updatedAt" }
  }
);

// Helpful compound indexes
DocumentSchema.index({ tenantId: 1, caseId: 1, documentType: 1, createdAt: -1 });
DocumentSchema.index({ tenantId: 1, "ocr.status": 1, createdAt: -1 });
DocumentSchema.index({ "storage.sha256": 1, tenantId: 1 }); // support dedupe per tenant

export default mongoose.model("Document", DocumentSchema);
