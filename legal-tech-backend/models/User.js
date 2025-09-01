import mongoose from "mongoose";

const userSchema = new mongoose.Schema({
  tenantId: { type: mongoose.Schema.Types.ObjectId, ref: "Tenant", required: true },
  name: { type: String, required: true },
  email: { type: String, required: true, unique: true },
  password: { type: String, required: true },

  // Updated role enum
  role: { type: String, enum: ["Lawyer", "Admin"], default: "Lawyer" },

  // Additional fields
  phone: { type: String },
  barId: { type: String },
  firm: { type: String },

  createdAt: { type: Date, default: Date.now },
});

export default mongoose.model("User", userSchema);
