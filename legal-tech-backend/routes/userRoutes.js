// routes/users.js
import { Router } from "express";
import {
  createTenant,
  createUser,
  deleteUser,
  getTenantById,
  getUserById,
  listUsersByTenant,
  login,
  updateUser
} from "../controllers/userController.js";
import { requireAuth } from "../security/auth.js";

const r = Router();

// Public
r.post("/auth/login", login);
r.post("/tenants", createTenant);

// Protected
r.get("/tenants/:tenantId", requireAuth, getTenantById);
r.post("/users", requireAuth, createUser);
r.get("/tenants/:tenantId/users", requireAuth, listUsersByTenant);
r.get("/users/:id", requireAuth, getUserById);
r.patch("/users/:id", requireAuth, updateUser);
r.delete("/users/:id", requireAuth, deleteUser);

export default r;
