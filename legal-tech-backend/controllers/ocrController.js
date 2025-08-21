// controllers/ocrController.js (ESM)
import Document from "../models/document.js";
import Case from "../models/case.js";

// Your OcrJob and DocumentText are CommonJS; import compatibly:
import OcrJobCjs from "../models/OcrJob.js";
const OcrJob = OcrJobCjs.default || OcrJobCjs;

import DocumentTextCjs from "../models/DocumentText.js";
const DocumentText = DocumentTextCjs.default || DocumentTextCjs;

/* ---------------- small utils ---------------- */
const pick = (obj, fields) =>
  Object.fromEntries(Object.entries(obj || {}).filter(([k]) => fields.includes(k)));

const DEVANAGARI_DIGITS = "०१२३४५६७८९";
const toAsciiDigits = (s = "") =>
  s.replace(/[०-९]/g, (d) => String(DEVANAGARI_DIGITS.indexOf(d)));

const normalizeNepali = (s = "") =>
  s
    .normalize("NFC")
    .replace(/\u200B|\u200C|\u200D|\u00AD/g, "") // zero-width & soft hyphen
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

/* ---------------- Controllers ---------------- */

/**
 * POST /ocr/jobs/queue
 * body: { documentId }
 */
export const queueOcr = async (req, res) => {
  try {
    const { documentId } = req.body || {};
    if (!documentId) return res.status(400).json({ message: "documentId is required" });

    const doc = await Document.findById(documentId);
    if (!doc) return res.status(404).json({ message: "Document not found" });

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
    return res.status(500).json({ message: err.message });
  }
};

/**
 * POST /ocr/jobs/:id/start
 * body: { engine? }
 */
export const startOcrJob = async (req, res) => {
  try {
    const job = await OcrJob.findById(req.params.id);
    if (!job) return res.status(404).json({ message: "Job not found" });
    if (job.status !== "queued") return res.status(409).json({ message: `Job not queued (status=${job.status})` });

    const engine = req.body?.engine || job.engine || "tesseract-nepali-5.4";
    job.status = "running";
    job.engine = engine;
    job.startedAt = new Date();
    await job.save();

    // mark document as running
    await Document.updateOne(
      { _id: job.documentId },
      { $set: { "ocr.status": "running" } }
    );

    return res.json({ message: "Job started", jobId: job._id, engine });
  } catch (err) {
    return res.status(500).json({ message: err.message });
  }
};

/**
 * POST /documents/:id/ocr-result
 * (Worker posts OCR output here to COMPLETE a job)
 * Optional query: ?jobId=<jobId>
 * body example:
 * {
 *   "fullText": "...",
 *   "avgConfidence": 0.91,
 *   "perPage": [{"page":1,"confidence":0.9,"textLen":1234,"textDensity":0.65}],
 *   "autoSections":[{"label":"petition","pageStart":3,"pageEnd":9,"confidence":0.82}],
 *   "entities":[{"type":"person","value":"गोपाल थापा","page":3,"offset":52}],
 *   "searchHints":["गोपाल थापा","जिल्ला अदालत काठमाडौं"],
 *   "extraction": {
 *     "dates": { "ad": ["2024-06-02T00:00:00.000Z"], "bs": ["2081/02/20"] },
 *     "caseNumbers": ["2079-01234"],
 *     "parties": { "persons": ["गोपाल थापा"], "orgs": ["नेपाल बैंक"] }
 *   },
 *   "metrics": { "pages": 12, "durationMs": 8450, "garbageRate": 0.03 }
 * }
 */
export const saveOcrResult = async (req, res) => {
  try {
    const documentId = req.params.id;
    const jobId = req.query.jobId;

    const doc = await Document.findById(documentId);
    if (!doc) return res.status(404).json({ message: "Document not found" });

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

    // normalize & mirrors
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

    // upsert DocumentText (unique per documentId)
    const upsert = {
      tenantId: doc.tenantId || undefined,
      documentId: doc._id,
      caseId: doc.caseId,
      section,
      fullText,
      fullText_ne_norm,
      numbers_ascii,
      // fullText_ne_tokens, fullText_roman can be filled later if needed
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
      { documentId: doc._id, tenantId: doc.tenantId || undefined },
      upsert,
      { upsert: true, new: true, setDefaultsOnInsert: true }
    );

    // update Document.ocr
    doc.ocr = doc.ocr || {};
    if (typeof avgConfidence === "number") {
      doc.ocr.avgConfidence = avgConfidence;
      doc.ocr.needsReview = avgConfidence < 0.85;
    }
    if (Array.isArray(perPage) && perPage.length) {
      doc.ocr.perPage = perPage.map((p) => pick(p, ["page", "confidence"]));
    }
    if (typeof metrics?.pages === "number") {
      // sync pages count into storage if missing
      if (!doc.storage?.pages) doc.storage.pages = metrics.pages;
      if (!doc.metadata?.pages) doc.metadata = { ...(doc.metadata || {}), pages: metrics.pages };
    }
    doc.ocr.status = "completed";
    doc.ocr.textDocId = docText._id;
    await doc.save();

    // finalize job if provided
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

    // ensure document is linked on case
    await Case.updateOne({ _id: doc.caseId }, { $addToSet: { documents: doc._id } });

    return res.status(200).json({ message: "OCR result saved", documentTextId: docText._id });
  } catch (err) {
    return res.status(500).json({ message: err.message });
  }
};

/**
 * POST /ocr/jobs/:id/fail
 * body: { message, stack?, metrics? }
 */
export const failOcrJob = async (req, res) => {
  try {
    const job = await OcrJob.findById(req.params.id);
    if (!job) return res.status(404).json({ message: "Job not found" });

    job.status = "failed";
    job.finishedAt = new Date();
    job.error = {
      message: req.body?.message || "Unknown OCR error",
      stack: req.body?.stack,
    };
    if (req.body?.metrics) job.metrics = pick(req.body.metrics, ["pages", "durationMs", "garbageRate"]);
    await job.save();

    // mark document failed (unless it already completed)
    await Document.updateOne(
      { _id: job.documentId, "ocr.status": { $ne: "completed" } },
      { $set: { "ocr.status": "failed" } }
    );

    return res.json({ message: "Job marked as failed" });
  } catch (err) {
    return res.status(500).json({ message: err.message });
  }
};

/**
 * GET /ocr/jobs/:id
 */
export const getOcrJob = async (req, res) => {
  try {
    const job = await OcrJob.findById(req.params.id);
    if (!job) return res.status(404).json({ message: "Job not found" });
    return res.json(job);
  } catch (err) {
    return res.status(500).json({ message: err.message });
  }
};

/**
 * GET /ocr/jobs?status=&docId=&page=&limit=
 */
export const listOcrJobs = async (req, res) => {
  try {
    const { status, docId, page = "1", limit = "20" } = req.query;
    const pageNum = Math.max(parseInt(page, 10) || 1, 1);
    const limitNum = Math.min(Math.max(parseInt(limit, 10) || 20, 1), 100);

    const filter = {};
    if (status) filter.status = status;
    if (docId) filter.documentId = docId;

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
    return res.status(500).json({ message: err.message });
  }
};
