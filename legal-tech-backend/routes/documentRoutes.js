// routes/documents.js
import { Router } from "express";
import {
  upload,                // multer middleware
  uploadDocument,
  getDocumentsByCase,
  getDocumentById,
  updateDocument,
  deleteDocument,
  requeueOcr
} from "../controllers/documentController.js";

const r = Router();

// Upload (multipart/form-data: file, caseId, documentType, uploadedBy, ...)
r.post("/documents/upload", upload.single("file"), uploadDocument);

// List documents for a case
r.get("/cases/:caseId/documents", getDocumentsByCase);

// Single document ops
r.get("/documents/:id", getDocumentById);
r.patch("/documents/:id", updateDocument);
r.post("/documents/:id/requeue-ocr", requeueOcr);
r.delete("/documents/:id", deleteDocument);

export default r;
