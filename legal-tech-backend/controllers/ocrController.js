// controllers/ocrController.js (ESM)
import Case from "../models/case.js";
import Document from "../models/document.js";
import DocumentText from "../models/DocumentText.js";
import OcrJob from "../models/OcrJob.js";

/* ---------------- small utils ---------------- */
const pick = (obj, fields) =>
  Object.fromEntries(Object.entries(obj || {}).filter(([k]) => fields.includes(k)));

const DEVANAGARI_DIGITS = "०१२३४५६७८९";
const toAsciiDigits = (s = "") =>
  s.replace(/[०-९]/g, (d) => String(DEVANAGARI_DIGITS.indexOf(d)));

const normalizeNepali = (s = "") =>
  s
    .normalize("NFC")
    .replace(/\u200B|\u200C|\u200D|\u00AD/g, "")
    .replace(/[“”]/g, '"')
    .replace(/[‘’]/g, "'")
    .trim();

const sha256Text = async (text) => {
  const { createHash } = await import("crypto");
  return createHash("sha256").update(text || "").digest("hex");
};

const typeToSection = (t = "") => {
  const map = {
    POA: "poa",
    Petition: "petition",
    Reply: "reply",
    Evidence: "evidence",
    "Interim Order": "order",
    Testimonial: "other",
    "District Judgment": "judgment",
    "High Court Appeal": "appeal",
    "High Court Judgment": "judgment",
    "Supreme Court Appeal": "appeal",
    "Supreme Court Judgment": "judgment",
  };
  return map[t] || "other";
};

/* ---------- access scope helpers ---------- */
const caseScopeFilter = (req) => {
  const tenantPart = req.tenantId ? { tenantId: req.tenantId } : {};
  if (req.user?.role === "Admin") return tenantPart;
  const uid = req.user?._id;
  if (!uid) return { _id: null };
  return {
    ...tenantPart,
    $or: [
      { "assignedTo.userId": uid },
      { "parties.lawyer": uid },
      { createdBy: uid },
    ],
  };
};

async function assertCaseAccess(req, caseId) {
  const filter = { _id: caseId, ...caseScopeFilter(req) };
  const ok = await Case.exists(filter);
  if (!ok) {
    const existsInTenant = await Case.exists({ _id: caseId, tenantId: req.tenantId });
    if (existsInTenant) {
      const err = new Error("Forbidden");
      err.statusCode = 403;
      throw err;
    }
    const err = new Error("Case not found");
    err.statusCode = 404;
    throw err;
  }
}

const isWorker = (req) =>
  !!req.headers["x-ocr-worker-key"] &&
  req.headers["x-ocr-worker-key"] === process.env.OCR_WORKER_KEY;

/* ---------------- Controllers ---------------- */

/**
 * POST /ocr/jobs/queue
 */
export const queueOcr = async (req, res) => {
  try {
    const { documentId } = req.body || {};
    if (!documentId) return res.status(400).json({ message: "documentId is required" });

    const doc = await Document.findById(documentId);
    if (!doc) return res.status(404).json({ message: "Document not found" });

    // SCOPE (Admin/Lawyer): must be able to access the parent case
    await assertCaseAccess(req, doc.caseId);

    const job = await OcrJob.create({
      tenantId: doc.tenantId || undefined,
      documentId: doc._id,
      status: "queued",
      engine: "tesseract-nepali-5.4",
      queuedAt: new Date(),
      attempt: 1,
    });

    doc.ocr = doc.ocr || {};
    doc.ocr.status = "pending";
    doc.ocrJob = job._id;
    await doc.save();

    return res.status(201).json({ jobId: job._id });
  } catch (err) {
    const status = err.statusCode || 500;
    return res.status(status).json({ message: err.message });
  }
};

/**
 * POST /ocr/jobs/:id/start
 */
export const startOcrJob = async (req, res) => {
  try {
    const job = await OcrJob.findById(req.params.id);
    if (!job) return res.status(404).json({ message: "Job not found" });

    // SCOPE: user must be able to access the parent case of the doc
    const doc = await Document.findById(job.documentId);
    if (!doc) return res.status(404).json({ message: "Document not found" });
    await assertCaseAccess(req, doc.caseId);

    if (job.status !== "queued") {
      return res.status(409).json({ message: `Job not queued (status=${job.status})` });
    }

    const engine = req.body?.engine || job.engine || "tesseract-nepali-5.4";
    job.status = "running";
    job.engine = engine;
    job.startedAt = new Date();
    await job.save();

    await Document.updateOne(
      { _id: job.documentId },
      { $set: { "ocr.status": "running" } }
    );

    return res.json({ message: "Job started", jobId: job._id, engine });
  } catch (err) {
    const status = err.statusCode || 500;
    return res.status(status).json({ message: err.message });
  }
};

/**
 * POST /documents/:id/ocr-result  (worker or user)
 */
export const saveOcrResult = async (req, res) => {
  try {
    const documentId = req.params.id;
    const jobId = req.query.jobId;

    const doc = await Document.findById(documentId);
    if (!doc) return res.status(404).json({ message: "Document not found" });

    // If not a worker request, enforce user scope
    if (!isWorker(req)) {
      await assertCaseAccess(req, doc.caseId);
    }

    const {
      fullText,
      avgConfidence,
      perPage = [],
      autoSections = [],
      entities = [],
      searchHints = [],
      extraction = {},
      metrics,
    } = req.body || {};

    if (!fullText || typeof fullText !== "string") {
      return res.status(400).json({ message: "fullText (string) is required" });
    }

    const tenantId = doc.tenantId || req.tenantId;
    if (!tenantId) return res.status(400).json({ message: "tenantId required" });

    const fullText_ne_norm = normalizeNepali(fullText);
    const numbers_ascii = toAsciiDigits(fullText_ne_norm);
    const textHash = await sha256Text(fullText_ne_norm);

    const pages = perPage.map((p) => ({
      page: p.page,
      confidence: typeof p.confidence === "number" ? p.confidence : undefined,
      textLen: typeof p.textLen === "number" ? p.textLen : (p.text ? p.text.length : undefined),
      textDensity: p.textDensity,
    }));

    const section = typeToSection(doc.documentType);

    const upsert = {
      tenantId,
      documentId: doc._id,
      caseId: doc.caseId,
      section,
      fullText,
      fullText_ne_norm,
      numbers_ascii,
      docTypeHints: [],
      entities,
      searchHints,
      quality: { avgConfidence: typeof avgConfidence === "number" ? avgConfidence : undefined },
      normalization: {
        version: "v1",
        needsReview: typeof avgConfidence === "number" ? avgConfidence < 0.85 : false,
        scriptRatio: { devanagari: 0, latin: 0 },
        garbageRate: metrics?.garbageRate ?? 0,
      },
      pages,
      autoSections,
      extraction,
      textHash,
    };

    const docText = await DocumentText.findOneAndUpdate(
      { documentId: doc._id, tenantId },
      upsert,
      { upsert: true, new: true, setDefaultsOnInsert: true }
    );

    doc.ocr = doc.ocr || {};
    if (typeof avgConfidence === "number") {
      doc.ocr.avgConfidence = avgConfidence;
      doc.ocr.needsReview = avgConfidence < 0.85;
    }
    if (Array.isArray(perPage) && perPage.length) {
      doc.ocr.perPage = perPage.map((p) => pick(p, ["page", "confidence"]));
    }
    if (typeof metrics?.pages === "number") {
      if (!doc.storage?.pages) doc.storage.pages = metrics.pages;
      if (!doc.metadata?.pages) doc.metadata = { ...(doc.metadata || {}), pages: metrics.pages };
    }
    doc.ocr.status = "completed";
    doc.ocr.textDocId = docText._id;
    await doc.save();

    if (jobId) {
      const job = await OcrJob.findById(jobId);
      if (job) {
        job.status = "completed";
        job.finishedAt = new Date();
        job.metrics = {
          pages: metrics?.pages,
          durationMs: metrics?.durationMs,
          garbageRate: metrics?.garbageRate,
        };
        await job.save();
      }
    }

    await Case.updateOne({ _id: doc.caseId }, { $addToSet: { documents: doc._id } });

    return res.status(200).json({ message: "OCR result saved", documentTextId: docText._id });
  } catch (err) {
    const status = err.statusCode || 500;
    return res.status(status).json({ message: err.message });
  }
};

/**
 * POST /ocr/jobs/:id/fail  (worker or user)
 */
export const failOcrJob = async (req, res) => {
  try {
    const job = await OcrJob.findById(req.params.id);
    if (!job) return res.status(404).json({ message: "Job not found" });

    // Enforce scope for non-worker calls
    if (!isWorker(req)) {
      const doc = await Document.findById(job.documentId);
      if (!doc) return res.status(404).json({ message: "Document not found" });
      await assertCaseAccess(req, doc.caseId);
    }

    job.status = "failed";
    job.finishedAt = new Date();
    job.error = {
      message: req.body?.message || "Unknown OCR error",
      stack: req.body?.stack,
    };
    if (req.body?.metrics) job.metrics = pick(req.body.metrics, ["pages", "durationMs", "garbageRate"]);
    await job.save();

    await Document.updateOne(
      { _id: job.documentId, "ocr.status": { $ne: "completed" } },
      { $set: { "ocr.status": "failed" } }
    );

    return res.json({ message: "Job marked as failed" });
  } catch (err) {
    const status = err.statusCode || 500;
    return res.status(status).json({ message: err.message });
  }
};

/**
 * GET /ocr/jobs/:id
 */
export const getOcrJob = async (req, res) => {
  try {
    const job = await OcrJob.findById(req.params.id);
    if (!job) return res.status(404).json({ message: "Job not found" });

    // Admin: fine. Lawyer: must have access to the job's document's case
    if (req.user?.role !== "Admin") {
      const doc = await Document.findById(job.documentId).lean();
      if (!doc) return res.status(404).json({ message: "Document not found" });
      await assertCaseAccess(req, doc.caseId);
    }

    return res.json(job);
  } catch (err) {
    const status = err.statusCode || 500;
    return res.status(status).json({ message: err.message });
  }
};

/**
 * GET /ocr/jobs?status=&docId=&page=&limit=
 * Admin: all jobs in tenant
 * Lawyer: only jobs for documents whose cases they can access
 */
export const listOcrJobs = async (req, res) => {
  try {
    const { status, docId, page = "1", limit = "20" } = req.query;
    const pageNum = Math.max(parseInt(page, 10) || 1, 1);
    const limitNum = Math.min(Math.max(parseInt(limit, 10) || 20, 1), 100);

    let filter = {};
    if (status) filter.status = status;
    if (docId) filter.documentId = docId;

    if (req.user?.role === "Admin") {
      // Admin scoping by tenant only (if you store tenantId on job)
      if (req.tenantId) filter.tenantId = req.tenantId;
    } else {
      // Lawyer: restrict to docs of accessible cases
      const accessibleCases = await Case.find(caseScopeFilter(req)).select("_id").lean();
      const caseIds = accessibleCases.map((c) => c._id);
      if (!caseIds.length) {
        return res.json({ page: pageNum, limit: limitNum, total: 0, items: [] });
      }
      const docs = await Document.find({
        tenantId: req.tenantId,
        caseId: { $in: caseIds }
      }).select("_id").lean();
      const docIds = docs.map((d) => d._id);
      if (!docIds.length) {
        return res.json({ page: pageNum, limit: limitNum, total: 0, items: [] });
      }
      filter.documentId = docId ? docId : { $in: docIds };
    }

    const [items, total] = await Promise.all([
      OcrJob.find(filter)
        .sort("-createdAt")
        .skip((pageNum - 1) * limitNum)
        .limit(limitNum)
        .lean(),
      OcrJob.countDocuments(filter),
    ]);

    return res.json({ page: pageNum, limit: limitNum, total, items });
  } catch (err) {
    const status = err.statusCode || 500;
    return res.status(status).json({ message: err.message });
  }
};
