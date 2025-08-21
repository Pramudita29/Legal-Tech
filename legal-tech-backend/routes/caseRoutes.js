// routes/cases.js
import { Router } from "express";
import {
  createCase,
  getCases,
  getCaseById,
  updateCase,
  deleteCase
} from "../controllers/caseController.js";

const r = Router();

// CRUD
r.post("/cases", createCase);
r.get("/cases", getCases);
r.get("/cases/:id", getCaseById);
r.patch("/cases/:id", updateCase);   // partial update
r.delete("/cases/:id", deleteCase);

export default r;
