// models/User.js (ESM)
import mongoose from "mongoose";
const { Schema, Types } = mongoose;

const UserSchema = new Schema({
  // Organization scoping:
  // - Admin: orgId === _id (self-owned org) + orgName required
  // - Firm Lawyer: orgId === admin._id
  // - Solo Lawyer: orgId === _id (one-person org)
  orgId: { type: Types.ObjectId, ref: "User", index: true },

  // Firm fields (meaningful for Admin accounts)
  orgName: String,       // firm / organization name
  orgAddress: String,
  orgPhone: String,

  // Identity
  name: { type: String, required: true },
  email: { type: String, required: true, unique: true, index: true },
  password: { type: String, required: true },

  role: { type: String, enum: ["Admin", "Lawyer"], default: "Lawyer", index: true },

  // Optional personal fields
  phone: String,

  createdAt: { type: Date, default: Date.now },
});

// Ensure orgId exists (self for both Admin and solo Lawyer by default)
UserSchema.pre("save", function (next) {
  if (!this.orgId) this.orgId = this._id;
  next();
});

export default mongoose.model("User", UserSchema);
