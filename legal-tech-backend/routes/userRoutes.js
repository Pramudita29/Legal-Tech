// routes/users.js
import { Router } from "express";
import {
  createTenant,
  getTenantById,
  createUser,
  listUsersByTenant,
  getUserById,
  updateUser,
  deleteUser,
  login
} from "../controllers/userController.js";

const r = Router();

// Tenants
r.post("/tenants", createTenant);
r.get("/tenants/:id", getTenantById);

// Users
r.post("/users", createUser);
r.get("/tenants/:tenantId/users", listUsersByTenant);
r.get("/users/:id", getUserById);
r.patch("/users/:id", updateUser);
r.delete("/users/:id", deleteUser);

// Simple login (no JWT yet)
r.post("/auth/login", login);

export default r;
