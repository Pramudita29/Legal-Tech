import mongoose from "mongoose";
const { Schema, Types } = mongoose;

const OcrJobSchema = new Schema({
  tenantId:   { type: Types.ObjectId, ref: "Tenant", index: true },
  documentId: { type: Types.ObjectId, ref: "Document", index: true },
  status:     { type: String, enum: ["queued","running","completed","failed"], default: "queued", index: true },
  engine:     String,
  queuedAt:   Date,
  startedAt:  Date,
  finishedAt: Date,
  metrics:    { pages: Number, durationMs: Number, garbageRate: Number },
  error:      { message: String, stack: String },
  attempt:    { type: Number, default: 1 }
}, { timestamps: true });

OcrJobSchema.index({ status: 1, queuedAt: -1 });

export default mongoose.model("OcrJob", OcrJobSchema);
