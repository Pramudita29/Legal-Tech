// controllers/documentController.js
import crypto from "crypto";
import fs from "fs";
import fsp from "fs/promises";
import multer from "multer";
import path from "path";
import Case from "../models/case.js";
import Document from "../models/document.js";
import OcrJob from "../models/OcrJob.js";

/* ------------- multer (local disk) ------------- */
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
  limits: { fileSize: 500 * 1024 * 1024 } // 500MB
});

/* ------------- helpers ------------- */
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

/* ---------- scope helpers ---------- */
const caseScopeFilter = (req) => {
  const orgPart = req.orgId ? { orgId: req.orgId } : {};
  if (req.user?.role === "Admin") return orgPart;
  const uid = req.user?._id;
  if (!uid) return { _id: null };
  return {
    ...orgPart,
    $or: [
      { "assignedTo.userId": uid },
      { "parties.lawyer": uid },
      { createdBy: uid },
    ]
  };
};

async function assertCaseAccess(req, caseId) {
  const filter = { _id: caseId, ...caseScopeFilter(req) };
  const ok = await Case.exists(filter);
  if (!ok) {
    const existsInOrg = await Case.exists({ _id: caseId, orgId: req.orgId });
    const err = new Error(existsInOrg ? "Forbidden" : "Case not found");
    err.statusCode = existsInOrg ? 403 : 404;
    throw err;
  }
}

/* ------------- controllers ------------- */

// POST /documents/upload
export const uploadDocument = async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ message: "No file uploaded" });

    const userId = req.user?._id;
    const {
      caseId,
      documentType,
      uploadedBy = userId,
      orgId = req.orgId,
      exhibitNo,
      exhibitTitle
    } = req.body;

    if (!caseId) return res.status(400).json({ message: "caseId is required" });
    if (!orgId) return res.status(400).json({ message: "orgId is required" });
    if (!uploadedBy) return res.status(401).json({ message: "Auth required" });

    // If documentType not provided, default to "Combined"
    const finalType = documentType && documentType.trim() !== "" ? documentType : "Combined";

    await assertCaseAccess(req, caseId);

    const abs = req.file.path;
    const sha256 = await sha256File(abs);

    const payload = {
      orgId,
      caseId,
      documentType: finalType,
      uploadedBy,
      originalFilename: req.file.originalname,
      storage: {
        provider: "local",
        bucket: null,
        key: path.basename(abs),
        mimeType: req.file.mimetype,
        sizeBytes: req.file.size,
        sha256
      },
      filePath: abs,
      metadata: { fileSize: req.file.size, fileType: req.file.mimetype },
      language: { iso: "ne", script: "Devanagari", mixed: true },
      source: { ingest: "upload" },
      ocr: { status: "pending", needsReview: false }
    };

    if (finalType === "Evidence" && (exhibitNo || exhibitTitle)) {
      payload.exhibit = {
        no: exhibitNo || undefined,
        title: exhibitTitle || undefined
      };
    }

    const doc = await Document.create(payload);

    await Case.updateOne(
      { _id: caseId, orgId },
      { $addToSet: { documents: doc._id } }
    );

    let ocrJobId = null;
    try {
      const job = await OcrJob.create({
        orgId,
        documentId: doc._id,
        status: "queued",
        engine: "tesseract-nepali-5.4",
        queuedAt: new Date(),
        attempt: 1
      });
      doc.ocrJob = job._id;
      await doc.save();
      ocrJobId = job._id;
    } catch (_) { }

    return res.status(201).json({ document: doc, ocrJobId });
  } catch (error) {
    if (req.file?.path) {
      try {
        await fsp.unlink(req.file.path);
      } catch { }
    }
    const status = error.statusCode || 500;
    if (error.message?.includes("Unsupported file type"))
      return res.status(415).json({ message: error.message });
    if (error?.code === 11000)
      return res.status(409).json({ message: "Duplicate document (same file hash)" });
    return res.status(status).json({ message: error.message });
  }
};

// GET /cases/:caseId/documents
export const getDocumentsByCase = async (req, res) => {
  try {
    const { caseId } = req.params;
    const { page = "1", limit = "20", type } = req.query;
    const orgId = req.orgId;

    await assertCaseAccess(req, caseId);

    const pageNum = Math.max(parseInt(page, 10) || 1, 1);
    const limitNum = Math.min(Math.max(parseInt(limit, 10) || 20, 1), 100);

    const filter = { caseId, orgId };
    if (type) filter.documentType = type;

    const [items, total] = await Promise.all([
      Document.find(filter)
        .select("documentType exhibit storage.mimeType storage.sizeBytes storage.key ocr.status createdAt")
        .sort("-createdAt").skip((pageNum - 1) * limitNum).limit(limitNum).lean(),
      Document.countDocuments(filter)
    ]);

    return res.json({ page: pageNum, limit: limitNum, total, items });
  } catch (error) {
    return res.status(error.statusCode || 500).json({ message: error.message });
  }
};

// GET /documents/:id
export const getDocumentById = async (req, res) => {
  try {
    const orgId = req.orgId;
    const doc = await Document.findOne({ _id: req.params.id, orgId })
      .populate({ path: "ocrJob", select: "status queuedAt startedAt finishedAt engine attempt" });
    if (!doc) return res.status(404).json({ message: "Document not found" });

    await assertCaseAccess(req, doc.caseId);
    return res.json(doc);
  } catch (error) { return res.status(error.statusCode || 500).json({ message: error.message }); }
};

// PATCH /documents/:id
export const updateDocument = async (req, res) => {
  try {
    const orgId = req.orgId;
    const allowed = ["exhibit", "language", "documentType"];
    const updates = pick(req.body, allowed);

    const current = await Document.findOne({ _id: req.params.id, orgId }).lean();
    if (!current) return res.status(404).json({ message: "Document not found" });

    await assertCaseAccess(req, current.caseId);

    const updated = await Document.findOneAndUpdate(
      { _id: current._id, orgId }, updates, { new: true, runValidators: true }
    );

    return res.json(updated);
  } catch (error) {
    if (error?.code === 11000) return res.status(409).json({ message: "Duplicate constraint" });
    return res.status(error.statusCode || 500).json({ message: error.message });
  }
};

// POST /documents/:id/requeue-ocr
export const requeueOcr = async (req, res) => {
  try {
    const orgId = req.orgId;
    const doc = await Document.findOne({ _id: req.params.id, orgId });
    if (!doc) return res.status(404).json({ message: "Document not found" });

    await assertCaseAccess(req, doc.caseId);

    const job = await OcrJob.create({
      orgId, documentId: doc._id, status: "queued", engine: "tesseract-nepali-5.4",
      queuedAt: new Date(), attempt: 1
    });

    doc.ocr.status = "pending";
    doc.ocrJob = job._id;
    await doc.save();

    return res.json({ message: "OCR re-queued", ocrJobId: job._id });
  } catch (error) { return res.status(error.statusCode || 500).json({ message: error.message }); }
};

// DELETE /documents/:id
export const deleteDocument = async (req, res) => {
  try {
    const orgId = req.orgId;
    const doc = await Document.findOne({ _id: req.params.id, orgId });
    if (!doc) return res.status(404).json({ message: "Document not found" });

    await assertCaseAccess(req, doc.caseId);

    await Document.deleteOne({ _id: doc._id, orgId });
    await Case.updateOne({ _id: doc.caseId, orgId }, { $pull: { documents: doc._id } });

    if (doc.filePath && fs.existsSync(doc.filePath)) { try { await fsp.unlink(doc.filePath); } catch { } }

    return res.json({ message: "Document deleted" });
  } catch (error) { return res.status(error.statusCode || 500).json({ message: error.message }); }
};
