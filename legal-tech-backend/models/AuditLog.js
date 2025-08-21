const mongoose = require("mongoose");
const { Schema, Types } = mongoose;

const AuditLogSchema = new Schema({
  tenantId: { type: Types.ObjectId, ref: "Tenant", index: true },
  actor: { userId: { type: Types.ObjectId, ref: "User" }, ip: String },
  action: { type: String, required: true }, // e.g., DOCUMENT_UPLOAD, OCR_COMPLETED
  resource: { type: String, required: true }, // "document","case","user",...
  resourceId: { type: Types.ObjectId, required: true },
  metadata: {},
  at: { type: Date, default: () => new Date() }
}, { timestamps: false });

AuditLogSchema.index({ tenantId: 1, at: -1 });
AuditLogSchema.index({ tenantId: 1, action: 1 });
AuditLogSchema.index({ tenantId: 1, resource: 1, resourceId: 1 });

module.exports = mongoose.model("AuditLog", AuditLogSchema);
