// Tenant
import mongoose from "mongoose";

const tenantSchema = new mongoose.Schema({
  name: { type: String, required: true },
  createdAt: { type: Date, default: Date.now },
});

export default mongoose.model("Tenant", tenantSchema);