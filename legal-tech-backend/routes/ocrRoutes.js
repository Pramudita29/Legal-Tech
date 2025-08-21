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

const r = Router();

// Jobs lifecycle
r.post("/ocr/jobs/queue", queueOcr);
r.post("/ocr/jobs/:id/start", startOcrJob);
r.post("/documents/:id/ocr-result", saveOcrResult); // worker posts result
r.post("/ocr/jobs/:id/fail", failOcrJob);

// Jobs read
r.get("/ocr/jobs/:id", getOcrJob);
r.get("/ocr/jobs", listOcrJobs);

export default r;
