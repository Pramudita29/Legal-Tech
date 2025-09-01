// routes/cases.js
import { Router } from "express";
import {
  createCase,
  getCases,
  getCaseById,
  updateCase,
  deleteCase
} from "../controllers/caseController.js";
import { requireAuth, allowRoles } from "../security/auth.js";

const r = Router();

// All case routes require auth
r.use(requireAuth);

// CRUD
r.post("/cases", allowRoles("Admin", "Lawyer"), createCase);
r.get("/cases", getCases);
r.get("/cases/:id", getCaseById);
r.patch("/cases/:id", allowRoles("Admin", "Lawyer"), updateCase);
r.delete("/cases/:id", allowRoles("Admin"), deleteCase);

export default r;
