// routes/users.js
import { Router } from "express";
import {
  createUser,
  deleteUser,
  getUserById,
  listUsersInOrg,
  login,
  registerAdmin,
  updateUser,
  registerLawyer
} from "../controllers/userController.js";
import { requireAuth } from "../security/auth.js";

const r = Router();

/* ---------- Public ---------- */
r.post("/auth/register-admin", registerAdmin);
r.post("/auth/login", login);
r.post("/auth/register-lawyer", registerLawyer);


/* ---------- Protected (JWT) ---------- */
// Admin creates lawyers in their org
r.post("/users", requireAuth, createUser);

// Admin lists users in their org
r.get("/org/users", requireAuth, listUsersInOrg);

// Self or Admin-in-same-org can view/update; Admin can delete org members
r.get("/users/:id", requireAuth, getUserById);
r.patch("/users/:id", requireAuth, updateUser);
r.delete("/users/:id", requireAuth, deleteUser);

export default r;
