// controllers/userController.js
import bcrypt from "bcryptjs";
import crypto from "crypto";
import User from "../models/User.js";
import { signToken } from "../security/auth.js";
import { sendLawyerInvite } from "../services/mailer.js";

/* utils */
const pick = (obj, fields) =>
  Object.fromEntries(Object.entries(obj || {}).filter(([k]) => fields.includes(k)));
const safeUser = (u) => {
  if (!u) return u;
  const o = u.toObject ? u.toObject() : u;
  delete o.password;
  return o;
};

/* ---------- PUBLIC: Register Admin (org owner) ----------
   POST /auth/register-admin
   body: { name, email, password, firmName, phone?, barId? }
*/
export const registerAdmin = async (req, res) => {
  try {
    const { name, email, password, firmName, phone } = req.body || {};
    if (!name || !email || !password || !firmName) {
      return res
        .status(400)
        .json({ message: "name, email, password, firmName required" });
    }
    const exists = await User.findOne({ email }).lean();
    if (exists) return res.status(409).json({ message: "Email already in use" });

    const hashed = await bcrypt.hash(password, 10);

    // Create Admin (no orgId yet)
    let admin = await User.create({
      name,
      email,
      password: hashed,
      role: "Admin",
      firm: firmName,
      phone,
    });

    // Admin owns the org: orgId = admin._id
    admin.orgId = admin._id;
    await admin.save();

    const token = signToken(admin); // your signToken must include orgId
    return res.status(201).json({ token, user: safeUser(admin) });
  } catch (err) {
    return res.status(500).json({ message: err.message });
  }
};

/* ---------- ADMIN: Create Lawyer in org & email creds ----------
   POST /users  (requireAuth; Admin only)
*/
export const createUser = async (req, res) => {
  try {
    if (req.user?.role !== "Admin")
      return res.status(403).json({ message: "Forbidden" });

    const allowed = ["name", "email", "password", "role", "phone"];
    const payload = pick(req.body, allowed);

    if (!payload.name || !payload.email) {
      return res
        .status(400)
        .json({ message: "name and email are required" });
    }

    // default role Lawyer; create temp password if none provided
    if (!payload.role) payload.role = "Lawyer";
    let plainPass = payload.password;
    if (!plainPass) {
      plainPass = crypto.randomBytes(6).toString("base64url");
      payload.password = plainPass;
    }

    // place in admin's org
    payload.orgId = req.orgId;
    payload.firm = req.user?.firm || undefined;

    // hash password
    payload.password = await bcrypt.hash(payload.password, 10);

    const user = await User.create(payload);

    // email credentials to the lawyer (to their email)
    try {
      await sendLawyerInvite({
        to: payload.email,
        firmName: payload.firm || "Your Firm",
        adminName: req.user?.name || "Admin",
        email: payload.email,
        tempPassword: plainPass,
      });
    } catch (e) {
      console.warn("Email send failed (dev ok):", e.message);
    }

    return res.status(201).json(safeUser(user));
  } catch (err) {
    if (err?.code === 11000)
      return res.status(409).json({ message: "Email already in use" });
    return res.status(500).json({ message: err.message });
  }
};

/* ---------- LIST users in my org (Admin only)
   GET /org/users?page=&limit=&q=&role=
*/
export const listUsersInOrg = async (req, res) => {
  try {
    if (req.user?.role !== "Admin")
      return res.status(403).json({ message: "Forbidden" });

    const { page = "1", limit = "20", q, role } = req.query;

    const p = Math.max(parseInt(page, 10) || 1, 1);
    const l = Math.min(Math.max(parseInt(limit, 10) || 20, 1), 100);

    const filter = { orgId: req.orgId };
    if (role) filter.role = role;
    if (q && String(q).trim()) {
      const rx = new RegExp(
        String(q).trim().replace(/[.*+?^${}()|[\]\\]/g, "\\$&"),
        "i"
      );
      filter.$or = [{ name: rx }, { email: rx }];
    }

    const [items, total] = await Promise.all([
      User.find(filter).sort("-createdAt").skip((p - 1) * l).limit(l).lean(),
      User.countDocuments(filter),
    ]);
    items.forEach((it) => delete it.password);

    return res.json({ page: p, limit: l, total, items });
  } catch (err) {
    return res.status(500).json({ message: err.message });
  }
};

/* ---------- SELF/ADMIN: get/update/delete ---------- */
export const getUserById = async (req, res) => {
  try {
    const u = await User.findById(req.params.id);
    if (!u) return res.status(404).json({ message: "User not found" });

    // Admin can see org users; a user can see self
    const sameUser = String(u._id) === String(req.user?._id);
    const adminSameOrg =
      req.user?.role === "Admin" && String(u.orgId) === String(req.orgId);
    if (!(sameUser || adminSameOrg)) {
      return res.status(403).json({ message: "Forbidden" });
    }
    return res.json(safeUser(u));
  } catch (err) {
    return res.status(500).json({ message: err.message });
  }
};

// PATCH /users/:id
export const updateUser = async (req, res) => {
  try {
    const target = await User.findById(req.params.id);
    if (!target) return res.status(404).json({ message: "User not found" });

    const isSelf = String(target._id) === String(req.user?._id);
    const isOrgAdminOverTarget =
      req.user?.role === "Admin" && String(target.orgId) === String(req.orgId);
    if (!(isSelf || isOrgAdminOverTarget))
      return res.status(403).json({ message: "Forbidden" });

    const allowed = isOrgAdminOverTarget
      ? ["name", "role", "password", "phone","firm"]
      : ["name", "password", "phone"];
    const updates = pick(req.body, allowed);

    if (updates.password) {
      updates.password = await bcrypt.hash(updates.password, 10);
    }

    const updated = await User.findByIdAndUpdate(target._id, updates, {
      new: true,
      runValidators: true,
    });
    return res.json(safeUser(updated));
  } catch (err) {
    if (err?.code === 11000)
      return res.status(409).json({ message: "Email already in use" });
    return res.status(500).json({ message: err.message });
  }
};

// DELETE /users/:id
export const deleteUser = async (req, res) => {
  try {
    const target = await User.findById(req.params.id);
    if (!target) return res.status(404).json({ message: "User not found" });
    if (!(req.user?.role === "Admin" && String(target.orgId) === String(req.orgId))) {
      return res.status(403).json({ message: "Forbidden" });
    }
    await User.findByIdAndDelete(target._id);
    return res.json({ message: "User deleted" });
  } catch (err) {
    return res.status(500).json({ message: err.message });
  }
};

/* ---------- LOGIN ----------
   POST /auth/login
*/
export const login = async (req, res) => {
  const { email, password } = req.body || {};
  if (!email || !password)
    return res.status(400).json({ message: "email and password are required" });

  const user = await User.findOne({ email });
  if (!user) return res.status(401).json({ message: "Invalid credentials" });

  const ok = await bcrypt.compare(password, user.password);
  if (!ok) return res.status(401).json({ message: "Invalid credentials" });

  if (!user.orgId) {
    user.orgId = user._id; // backfill legacy
    await user.save();
  }

  const token = signToken(user); // ensure orgId is included in JWT payload
  const profile = {
    _id: user._id,
    name: user.name,
    email: user.email,
    role: user.role,
    orgId: user.orgId,
    firm: user.firm,
  };

  return res.json({ token, user: profile });
};
