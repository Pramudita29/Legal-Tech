import mongoose from "mongoose";
const { Schema, Types } = mongoose;

const AutoSectionSchema = new Schema({ /* ...unchanged... */ }, { _id: false });
const PageSummarySchema = new Schema({ /* ...unchanged... */ }, { _id: false });
const EntitySchema = new Schema({ /* ...unchanged... */ }, { _id: false });

const DocumentTextSchema = new Schema({
  tenantId:   { type: Types.ObjectId, ref: "Tenant", required: true, index: true },
  documentId: { type: Types.ObjectId, ref: "Document", required: true, unique: true },
  caseId:     { type: Types.ObjectId, ref: "Case", required: true, index: true },
  section:    { type: String, enum: ["poa","petition","reply","evidence","order","judgment","appeal","other"], required: true },
  fullText:           { type: String, required: true },
  fullText_ne_norm:   { type: String },
  fullText_ne_tokens: { type: String },
  fullText_roman:     { type: String },
  numbers_ascii:      { type: String },
  docTypeHints:       [String],
  entities:           [EntitySchema],
  searchHints:        [String],
  quality: { avgConfidence: { type: Number } },
  normalization: {
    version: { type: String, default: "v1" },
    needsReview: { type: Boolean, default: false },
    scriptRatio: { devanagari: { type: Number, default: 0 }, latin: { type: Number, default: 0 } },
    garbageRate: { type: Number, default: 0 }
  },
  pages: [PageSummarySchema],
  autoSections: [AutoSectionSchema],
  extraction: {
    dates: { ad: [Date], bs: [String] },
    caseNumbers: [String],
    parties: { persons: [String], orgs: [String] }
  },
  textHash: { type: String }
}, { timestamps: true });

DocumentTextSchema.index({ tenantId: 1, documentId: 1 }, { unique: true });
DocumentTextSchema.index({ tenantId: 1, caseId: 1, section: 1 });
DocumentTextSchema.index({ numbers_ascii: 1 });
DocumentTextSchema.index({ "extraction.caseNumbers": 1 });
DocumentTextSchema.index({ "entities.value": 1 });
DocumentTextSchema.index(
  { fullText_ne_norm: "text", docTypeHints: "text", searchHints: "text" },
  { default_language: "none" }
);

export default mongoose.model("DocumentText", DocumentTextSchema);
