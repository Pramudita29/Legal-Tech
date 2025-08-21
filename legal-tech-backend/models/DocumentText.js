const mongoose = require("mongoose");
const { Schema, Types } = mongoose;

const AutoSectionSchema = new Schema({
  label: {
    type: String,
    enum: ["poa","petition","reply","evidence","order","judgment","appeal","other"],
  },
  pageStart: Number,
  pageEnd: Number,
  confidence: Number
}, { _id: false });

const PageSummarySchema = new Schema({
  page: Number,
  textLen: Number,          // chars after OCR
  confidence: Number,       // per-page OCR conf (0..1)
  textDensity: Number       // chars per area heuristic (for evidence detection)
}, { _id: false });

const EntitySchema = new Schema({
  type: { type: String },   // person|org|court|date|case_no|location
  value: String,
  page: Number,
  offset: Number
}, { _id: false });

const DocumentTextSchema = new Schema({
  tenantId:   { type: Types.ObjectId, ref: "Tenant", required: true, index: true },
  documentId: { type: Types.ObjectId, ref: "Document", required: true, unique: true },
  caseId:     { type: Types.ObjectId, ref: "Case", required: true, index: true },

  // Primary section the document belongs to
  section:    { type: String, enum: ["poa","petition","reply","evidence","order","judgment","appeal","other"], required: true },

  // ===== Raw + Nepali-aware variants =====
  fullText:           { type: String, required: true }, // raw OCR or typed
  fullText_ne_norm:   { type: String },                 // Unicode-normalized (NFC, punctuation/digit harmonization)
  fullText_ne_tokens: { type: String },                 // tokenized/edge-ngrams string (optional)
  fullText_roman:     { type: String },                 // romanized helper (optional)
  numbers_ascii:      { type: String },                 // ASCII mirror of numbers (e.g., "2079 01234")
  docTypeHints:       [String],                         // e.g., "वकालतनामा","अन्तरिम आदेश",...

  // Named entities & quick search hints
  entities:           [EntitySchema],
  searchHints:        [String],                         // party names, court names, exhibit titles, etc.

  // ===== Quality / normalization metadata =====
  quality: {
    avgConfidence: { type: Number }                     // overall OCR confidence (0..1)
  },
  normalization: {
    version: { type: String, default: "v1" },
    needsReview: { type: Boolean, default: false },     // flag for human QA
    scriptRatio: {                                      // rough script share to detect mixed text
      devanagari: { type: Number, default: 0 },
      latin: { type: Number, default: 0 }
    },
    garbageRate: { type: Number, default: 0 }           // percent of non-letter noise
  },

  // ===== Page-level summaries & auto sectioning (optional but powerful) =====
  pages: [PageSummarySchema],                           // per-page stats (helps detect evidence pages)
  autoSections: [AutoSectionSchema],                    // page ranges auto-detected as sections

  // ===== Extracted facts for filters =====
  extraction: {
    dates: {
      ad:  [Date],
      bs:  [String]                                     // store raw BS strings if parsed
    },
    caseNumbers: [String],                               // normalized case nos. (ASCII)
    parties: {
      persons: [String],
      orgs:    [String]
    }
  },

  // Integrity / dedupe helpers
  textHash: { type: String }                             // sha256 of normalized text (optional)

}, { timestamps: true });

/* ===== Indexes ===== */
DocumentTextSchema.index({ tenantId: 1, documentId: 1 }, { unique: true });
DocumentTextSchema.index({ tenantId: 1, caseId: 1, section: 1 });
DocumentTextSchema.index({ numbers_ascii: 1 });
DocumentTextSchema.index({ "extraction.caseNumbers": 1 });
DocumentTextSchema.index({ "entities.value": 1 });
DocumentTextSchema.index(
  { fullText_ne_norm: "text", docTypeHints: "text", searchHints: "text" },
  { default_language: "none" }
);

module.exports = mongoose.model("DocumentText", DocumentTextSchema);
