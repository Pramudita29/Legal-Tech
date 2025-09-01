// routes/documents.js
import { Router } from "express";
import {
  upload,
  uploadDocument,
  getDocumentsByCase,
  getDocumentById,
  updateDocument,
  deleteDocument,
  requeueOcr
} from "../controllers/documentController.js";
import { requireAuth, allowRoles } from "../security/auth.js";

const r = Router();

// All document routes require auth
r.use(requireAuth);

// Upload (multipart/form-data: file, caseId, documentType, uploadedBy, ...)
r.post("/documents/upload", allowRoles("Admin", "Lawyer"), upload.single("file"), uploadDocument);

// List documents for a case
r.get("/cases/:caseId/documents", getDocumentsByCase);

// Single document ops
r.get("/documents/:id", getDocumentById);
r.patch("/documents/:id", allowRoles("Admin", "Lawyer"), updateDocument);
r.post("/documents/:id/requeue-ocr", allowRoles("Admin"), requeueOcr);
r.delete("/documents/:id", allowRoles("Admin"), deleteDocument);

export default r;
