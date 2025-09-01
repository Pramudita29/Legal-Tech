// routes/ocr.js
import { Router } from "express";
import {
  queueOcr,
  startOcrJob,
  saveOcrResult,
  failOcrJob,
  getOcrJob,
  listOcrJobs
} from "../controllers/ocrController.js";
import { requireAuth, allowRoles, requireWorkerOrAuth } from "../security/auth.js";

const r = Router();

// Most OCR endpoints require auth...
r.post("/ocr/jobs/queue", requireAuth, allowRoles("Admin", "Lawyer"), queueOcr);
r.post("/ocr/jobs/:id/start", requireAuth, allowRoles("Admin"), startOcrJob);

// ...but OCR worker can POST results with X-OCR-Worker-Key header OR a user token
r.post("/documents/:id/ocr-result", requireWorkerOrAuth, saveOcrResult);
r.post("/ocr/jobs/:id/fail", requireWorkerOrAuth, failOcrJob);

// Reads require auth
r.get("/ocr/jobs/:id", requireAuth, getOcrJob);
r.get("/ocr/jobs", requireAuth, listOcrJobs);

export default r;
