// models/DocumentText.js
import mongoose from "mongoose";

const { Schema, Types } = mongoose;

/* ---------------- Embedded Schemas ---------------- */

// Sections auto-detected from OCR (optional)
const AutoSectionSchema = new Schema(
  {
    label: { type: String },       // e.g., "Facts", "Judgment", "Arguments"
    pageStart: { type: Number },
    pageEnd: { type: Number },
    confidence: { type: Number },  // 0–1
  },
  { _id: false }
);

// Per-page summary
const PageSummarySchema = new Schema(
  {
    page: { type: Number },
    confidence: { type: Number },  // OCR engine confidence
    textLen: { type: Number },
    textDensity: { type: Number }, // characters per area
  },
  { _id: false }
);

// Entities found in OCR text
const EntitySchema = new Schema(
  {
    type: { type: String },    // e.g., "person", "organization", "location"
    value: { type: String },   // the entity text
    offset: { type: Number },  // position in text
    length: { type: Number },
  },
  { _id: false }
);

/* ---------------- Main Schema ---------------- */

const DocumentTextSchema = new Schema(
  {
    // 🔁 org-first model
    orgId: { type: Types.ObjectId, ref: "User", required: true, index: true },

    documentId: { type: Types.ObjectId, ref: "Document", required: true, unique: true },
    caseId: { type: Types.ObjectId, ref: "Case", required: true, index: true },

    section: {
      type: String,
      enum: ["poa", "petition", "reply", "evidence", "order", "judgment", "appeal", "other"],
      required: true,
    },

    // OCR text
    fullText: { type: String, required: true },
    fullText_ne_norm: { type: String },   // normalized Nepali
    fullText_ne_tokens: { type: String }, // tokenized Nepali
    fullText_roman: { type: String },     // romanized
    numbers_ascii: { type: String },      // digits converted to ASCII

    // NLP / indexing aids
    docTypeHints: [String],
    entities: [EntitySchema],
    searchHints: [String],

    // Quality / normalization
    quality: { avgConfidence: { type: Number } },
    normalization: {
      version: { type: String, default: "v1" },
      needsReview: { type: Boolean, default: false },
      scriptRatio: {
        devanagari: { type: Number, default: 0 },
        latin: { type: Number, default: 0 },
      },
      garbageRate: { type: Number, default: 0 },
    },

    pages: [PageSummarySchema],
    autoSections: [AutoSectionSchema],

    extraction: {
      dates: { ad: [Date], bs: [String] },
      caseNumbers: [String],
      parties: {
        persons: [String],
        orgs: [String],
      },
    },

    textHash: { type: String }, // SHA-256 for dedupe
  },
  { timestamps: true }
);

/* ---------------- Indexes ---------------- */

// Per-org uniqueness
DocumentTextSchema.index({ orgId: 1, documentId: 1 }, { unique: true });
DocumentTextSchema.index({ orgId: 1, caseId: 1, section: 1 });

// Search helpers
DocumentTextSchema.index({ numbers_ascii: 1 });
DocumentTextSchema.index({ "extraction.caseNumbers": 1 });
DocumentTextSchema.index({ "entities.value": 1 });

// Full-text search (disable default stemming/language)
DocumentTextSchema.index(
  { fullText_ne_norm: "text", docTypeHints: "text", searchHints: "text" },
  { default_language: "none" }
);

export default mongoose.model("DocumentText", DocumentTextSchema);
