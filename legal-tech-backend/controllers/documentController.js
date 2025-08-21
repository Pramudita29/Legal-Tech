// controllers/documentController.js (ESM) — matches your models/document.js
import fs from "fs";
import fsp from "fs/promises";
import path from "path";
import crypto from "crypto";
import multer from "multer";
import Document from "../models/document.js";
import Case from "../models/case.js";
import OcrJob from "../models/OcrJob.js"; // ensure filename/casing matches your project

/* ---------------- multer (local disk). swap to S3/MinIO later ---------------- */
const UPLOAD_DIR = path.resolve("uploads");
if (!fs.existsSync(UPLOAD_DIR)) fs.mkdirSync(UPLOAD_DIR, { recursive: true });

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, UPLOAD_DIR),
  filename: (_req, file, cb) => {
    const safe = file.originalname.replace(/[^\w.\-()+\s]/g, "_");
    cb(null, `${Date.now()}-${safe}`);
  }
});

const fileFilter = (_req, file, cb) => {
  const ok = /pdf|png|jpg|jpeg|tif|tiff/i.test(file.mimetype);
  if (!ok) return cb(new Error("Unsupported file type"), false);
  cb(null, true);
};

export const upload = multer({
  storage,
  fileFilter,
  limits: { fileSize: 50 * 1024 * 1024 } // 50 MB
});

/* ---------------- helpers ---------------- */
const sha256File = async (absPath) =>
  new Promise((resolve, reject) => {
    const h = crypto.createHash("sha256");
    fs.createReadStream(absPath)
      .on("data", (d) => h.update(d))
      .on("end", () => resolve(h.digest("hex")))
      .on("error", reject);
  });

const pick = (obj, fields) =>
  Object.fromEntries(Object.entries(obj || {}).filter(([k]) => fields.includes(k)));

/* ---------------- controllers ---------------- */

/**
 * POST /documents/upload
 * multipart/form-data fields:
 *   - file (required)
 *   - caseId (required)
 *   - documentType (required; must be one of your enum)
 *   - uploadedBy (required for now since model requires it)
 *   - tenantId (optional for now; if you use tenants already, send it)
 *   - exhibitNo, exhibitTitle (optional; for Evidence)
 */
export const uploadDocument = async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ message: "No file uploaded" });

    const {
      caseId,
      documentType,
      uploadedBy,
      tenantId,          // optional now
      exhibitNo,
      exhibitTitle
    } = req.body;

    if (!caseId || !documentType || !uploadedBy) {
      return res.status(400).json({ message: "caseId, documentType, and uploadedBy are required" });
    }

    // verify case exists
    const caseDoc = await Case.findById(caseId).select("_id");
    if (!caseDoc) return res.status(404).json({ message: "Case not found" });

    // compute SHA-256 for dedupe/integrity
    const abs = req.file.path;
    const sha256 = await sha256File(abs);

    // build payload to match your Document model
    const payload = {
      tenantId: tenantId || undefined,
      caseId,
      documentType,
      uploadedBy,
      originalFilename: req.file.originalname,
      storage: {
        provider: "local",
        bucket: null,
        key: path.basename(abs),     // local filename as key
        mimeType: req.file.mimetype,
        sizeBytes: req.file.size,
        // pages: set later once you parse PDF, if you want
        sha256
      },
      filePath: abs,                 // keep legacy path (your validator accepts key OR filePath)
      metadata: {
        fileSize: req.file.size,
        fileType: req.file.mimetype
      },
      language: { iso: "ne", script: "Devanagari", mixed: true },
      source: { ingest: "upload" },
      ocr: { status: "pending", needsReview: false }
    };

    if (documentType === "Evidence" && (exhibitNo || exhibitTitle)) {
      payload.exhibit = { no: exhibitNo || undefined, title: exhibitTitle || undefined };
    }

    const doc = await Document.create(payload);

    // attach to case
    await Case.updateOne({ _id: caseId }, { $addToSet: { documents: doc._id } });

    // queue OCR job (optional but recommended)
    let ocrJobId = null;
    try {
      const job = await OcrJob.create({
        tenantId: tenantId || undefined,
        documentId: doc._id,
        status: "queued",
        engine: "tesseract-nepali-5.4",
        queuedAt: new Date(),
        attempt: 1
      });
      doc.ocrJob = job._id;
      await doc.save();
      ocrJobId = job._id;
    } catch (_) {
      // if ocr model not set up yet, just ignore; doc.ocr.status remains 'pending'
    }

    return res.status(201).json({ document: doc, ocrJobId });
  } catch (error) {
    // cleanup the uploaded file if DB ops fail
    if (req.file?.path) {
      try { await fsp.unlink(req.file.path); } catch {}
    }
    if (error.message?.includes("Unsupported file type")) {
      return res.status(415).json({ message: error.message });
    }
    if (error?.code === 11000) {
      // likely due to unique sparse index on storage.sha256 (or tenant+sha256)
      return res.status(409).json({ message: "Duplicate document (same file hash)" });
    }
    return res.status(500).json({ message: error.message });
  }
};

/**
 * GET /cases/:caseId/documents?page=&limit=&type=
 */
export const getDocumentsByCase = async (req, res) => {
  try {
    const { caseId } = req.params;
    const { page = "1", limit = "20", type } = req.query;

    const exists = await Case.exists({ _id: caseId });
    if (!exists) return res.status(404).json({ message: "Case not found" });

    const pageNum = Math.max(parseInt(page, 10) || 1, 1);
    const limitNum = Math.min(Math.max(parseInt(limit, 10) || 20, 1), 100);

    const filter = { caseId };
    if (type) filter.documentType = type;

    const [items, total] = await Promise.all([
      Document.find(filter)
        .select("documentType exhibit storage.mimeType storage.sizeBytes storage.key ocr.status createdAt")
        .sort("-createdAt")
        .skip((pageNum - 1) * limitNum)
        .limit(limitNum)
        .lean(),
      Document.countDocuments(filter)
    ]);

    return res.json({ page: pageNum, limit: limitNum, total, items });
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
};

/**
 * GET /documents/:id
 */
export const getDocumentById = async (req, res) => {
  try {
    const doc = await Document.findById(req.params.id)
      .populate({ path: "ocrJob", select: "status queuedAt startedAt finishedAt engine attempt" });

    if (!doc) return res.status(404).json({ message: "Document not found" });
    return res.json(doc);
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
};

/**
 * PATCH /documents/:id
 * Allow updating safe fields only (exhibit, language, documentType)
 */
export const updateDocument = async (req, res) => {
  try {
    const allowed = ["exhibit", "language", "documentType"];
    const updates = pick(req.body, allowed);

    const updated = await Document.findOneAndUpdate(
      { _id: req.params.id },
      updates,
      { new: true, runValidators: true }
    );

    if (!updated) return res.status(404).json({ message: "Document not found" });
    return res.json(updated);
  } catch (error) {
    if (error?.code === 11000) {
      return res.status(409).json({ message: "Duplicate constraint" });
    }
    return res.status(500).json({ message: error.message });
  }
};

/**
 * POST /documents/:id/requeue-ocr
 */
export const requeueOcr = async (req, res) => {
  try {
    const doc = await Document.findById(req.params.id);
    if (!doc) return res.status(404).json({ message: "Document not found" });

    const job = await OcrJob.create({
      tenantId: doc.tenantId || undefined,
      documentId: doc._id,
      status: "queued",
      engine: "tesseract-nepali-5.4",
      queuedAt: new Date(),
      attempt: 1
    });

    doc.ocr.status = "pending";
    doc.ocrJob = job._id;
    await doc.save();

    return res.json({ message: "OCR re-queued", ocrJobId: job._id });
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
};

/**
 * DELETE /documents/:id
 * Detach from case and (optionally) delete local file.
 */
export const deleteDocument = async (req, res) => {
  try {
    const doc = await Document.findByIdAndDelete(req.params.id);
    if (!doc) return res.status(404).json({ message: "Document not found" });

    await Case.updateOne({ _id: doc.caseId }, { $pull: { documents: doc._id } });

    // remove local file if present
    if (doc.filePath && fs.existsSync(doc.filePath)) {
      try { await fsp.unlink(doc.filePath); } catch {}
    }

    return res.json({ message: "Document deleted" });
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
};
