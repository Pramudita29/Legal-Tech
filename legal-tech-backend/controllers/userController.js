// controllers/userController.js (ESM)
import bcrypt from "bcryptjs";
import Tenant from "../models/Tenant.js";
import User from "../models/User.js";
import { signToken } from "../security/auth.js";


/* ---------------- small utils ---------------- */
const pick = (obj, fields) =>
  Object.fromEntries(Object.entries(obj || {}).filter(([k]) => fields.includes(k)));

const safeUser = (u) => {
  if (!u) return u;
  const obj = u.toObject ? u.toObject() : u;
  delete obj.password;
  return obj;
};

/* ---------------- TENANT ---------------- */

// POST /tenants
export const createTenant = async (req, res) => {
  try {
    const allowed = ["name", "subscriptionPlan"];
    const payload = pick(req.body, allowed);
    if (!payload.name) return res.status(400).json({ message: "name is required" });

    const tenant = await Tenant.create(payload);
    return res.status(201).json(tenant);
  } catch (err) {
    return res.status(500).json({ message: err.message });
  }
};

// GET /tenants/:id
export const getTenantById = async (req, res) => {
  try {
    const t = await Tenant.findById(req.params.id);
    if (!t) return res.status(404).json({ message: "Tenant not found" });
    return res.json(t);
  } catch (err) {
    return res.status(500).json({ message: err.message });
  }
};

/* ---------------- USERS ---------------- */

// POST /users
// body: { tenantId, name, email, password, role? }
export const createUser = async (req, res) => {
  try {
    const allowed = ["tenantId", "name", "email", "password", "role"];
    const payload = pick(req.body, allowed);

    if (!payload.tenantId || !payload.name || !payload.email || !payload.password) {
      return res.status(400).json({ message: "tenantId, name, email, and password are required" });
    }

    // Ensure tenant exists
    const tenant = await Tenant.findById(payload.tenantId).select("_id");
    if (!tenant) return res.status(404).json({ message: "Tenant not found" });

    // Hash password
    const salt = await bcrypt.genSalt(10);
    payload.password = await bcrypt.hash(payload.password, salt);

    const user = await User.create(payload);
    return res.status(201).json(safeUser(user));
  } catch (err) {
    if (err?.code === 11000) {
      // email unique clash (global unique in your schema)
      return res.status(409).json({ message: "Email already in use" });
    }
    return res.status(500).json({ message: err.message });
  }
};

// GET /tenants/:tenantId/users?page=&limit=&q=&role=
export const listUsersByTenant = async (req, res) => {
  try {
    const { tenantId } = req.params;
    const { page = "1", limit = "20", q, role } = req.query;

    // ensure tenant exists
    const t = await Tenant.exists({ _id: tenantId });
    if (!t) return res.status(404).json({ message: "Tenant not found" });

    const p = Math.max(parseInt(page, 10) || 1, 1);
    const l = Math.min(Math.max(parseInt(limit, 10) || 20, 1), 100);

    const filter = { tenantId };
    if (role) filter.role = role;
    if (q && String(q).trim()) {
      const rx = new RegExp(String(q).trim().replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i");
      filter.$or = [{ name: rx }, { email: rx }];
    }

    const [items, total] = await Promise.all([
      User.find(filter).sort("-createdAt").skip((p - 1) * l).limit(l).lean(),
      User.countDocuments(filter)
    ]);

    // scrub passwords
    items.forEach((it) => delete it.password);

    return res.json({ page: p, limit: l, total, items });
  } catch (err) {
    return res.status(500).json({ message: err.message });
  }
};

// GET /users/:id
export const getUserById = async (req, res) => {
  try {
    const u = await User.findById(req.params.id);
    if (!u) return res.status(404).json({ message: "User not found" });
    return res.json(safeUser(u));
  } catch (err) {
    return res.status(500).json({ message: err.message });
  }
};

// PATCH /users/:id
// body can include: name, role, password
export const updateUser = async (req, res) => {
  try {
    const allowed = ["name", "role", "password"];
    const updates = pick(req.body, allowed);

    // hash new password if provided
    if (updates.password) {
      const salt = await bcrypt.genSalt(10);
      updates.password = await bcrypt.hash(updates.password, salt);
    }

    const updated = await User.findByIdAndUpdate(
      req.params.id,
      updates,
      { new: true, runValidators: true }
    );

    if (!updated) return res.status(404).json({ message: "User not found" });
    return res.json(safeUser(updated));
  } catch (err) {
    if (err?.code === 11000) {
      return res.status(409).json({ message: "Email already in use" });
    }
    return res.status(500).json({ message: err.message });
  }
};

// DELETE /users/:id
export const deleteUser = async (req, res) => {
  try {
    const deleted = await User.findByIdAndDelete(req.params.id);
    if (!deleted) return res.status(404).json({ message: "User not found" });
    return res.json({ message: "User deleted" });
  } catch (err) {
    return res.status(500).json({ message: err.message });
  }
};


export const login = async (req, res) => {
  const { email, password } = req.body || {};
  if (!email || !password) return res.status(400).json({ message: "email and password are required" });

  const user = await User.findOne({ email });
  if (!user) return res.status(401).json({ message: "Invalid credentials" });

  const ok = await bcrypt.compare(password, user.password);
  if (!ok) return res.status(401).json({ message: "Invalid credentials" });

  const token = signToken(user);
  const profile = { _id: user._id, name: user.name, email: user.email, role: user.role, tenantId: user.tenantId };

  return res.json({ token, user: profile });
};
