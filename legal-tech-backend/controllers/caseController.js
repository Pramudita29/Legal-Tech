// controllers/caseController.js (ESM) — matches your models/case.js
import Case from "../models/case.js";

/* ---------- small utils ---------- */
const pick = (obj, fields) =>
  Object.fromEntries(Object.entries(obj || {}).filter(([k]) => fields.includes(k)));

const parseIntOr = (v, d) => {
  const n = parseInt(v, 10);
  return Number.isFinite(n) && n > 0 ? n : d;
};

/* ---------- CREATE ---------- */
// POST /cases
export const createCase = async (req, res) => {
  try {
    // only allow fields that exist on the schema
    const allowed = [
      "tenantId",           // optional for now (no auth yet)
      "caseNumber",
      "caseTitle",
      "courtLevel",
      "caseType",
      "status",
      "parentCaseId",
      "appealCaseId",
      "parties",
      "dates",
      "hearings",
      "documents",
      "assignedTo"
    ];
    const payload = pick(req.body, allowed);

    const created = await Case.create(payload);
    return res.status(201).json(created);
  } catch (error) {
    if (error?.code === 11000) {
      // unique index clash (caseNumber or tenant+caseNumber if you add compound)
      return res.status(409).json({ message: "Case number already exists" });
    }
    return res.status(500).json({ message: error.message });
  }
};

/* ---------- LIST (filters + pagination) ---------- */
// GET /cases?q=&status=&courtLevel=&caseType=&page=&limit=&sort=
export const getCases = async (req, res) => {
  try {
    const {
      q,               // free text search on caseNumber, caseTitle, parties.name
      status,
      courtLevel,
      caseType,
      page = "1",
      limit = "20",
      sort = "-updatedAt" // e.g. "caseNumber" or "-dates.nextHearingAD"
    } = req.query;

    const pageNum = parseIntOr(page, 1);
    const limitNum = Math.min(parseIntOr(limit, 20), 100);

    const filter = {};
    if (status) filter.status = status;
    if (courtLevel) filter.courtLevel = courtLevel;
    if (caseType) filter.caseType = caseType;

    if (q && String(q).trim()) {
      const rx = new RegExp(String(q).trim().replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i");
      filter.$or = [
        { caseNumber: rx },
        { caseTitle: rx },
        { "parties.name": rx }
      ];
    }

    const cursor = Case.find(filter)
      .sort(sort)
      .skip((pageNum - 1) * limitNum)
      .limit(limitNum)
      .select("-__v")
      .populate({ path: "parties.lawyer", select: "name email roles" })
      .populate({ path: "documents", select: "documentType storage.key storage.mimeType createdAt" })
      .lean();

    const [items, total] = await Promise.all([cursor, Case.countDocuments(filter)]);

    return res.json({ page: pageNum, limit: limitNum, total, items });
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
};

/* ---------- GET ONE ---------- */
// GET /cases/:id
export const getCaseById = async (req, res) => {
  try {
    const doc = await Case.findById(req.params.id)
      .select("-__v")
      .populate({ path: "parties.lawyer", select: "name email roles" })
      .populate({ path: "documents", select: "documentType storage.key storage.mimeType createdAt" });

    if (!doc) return res.status(404).json({ message: "Case not found" });
    return res.json(doc);
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
};

/* ---------- UPDATE (allow-listed) ---------- */
// PATCH /cases/:id
export const updateCase = async (req, res) => {
  try {
    const allowed = [
      "caseTitle",
      "courtLevel",
      "caseType",
      "status",
      "parentCaseId",
      "appealCaseId",
      "parties",
      "dates",
      "hearings",
      "documents",
      "assignedTo"
    ];
    const updates = pick(req.body, allowed);

    const updated = await Case.findByIdAndUpdate(
      req.params.id,
      updates,
      { new: true, runValidators: true }
    )
      .populate({ path: "parties.lawyer", select: "name email roles" })
      .populate({ path: "documents", select: "documentType storage.key storage.mimeType createdAt" });

    if (!updated) return res.status(404).json({ message: "Case not found" });
    return res.json(updated);
  } catch (error) {
    if (error?.code === 11000) {
      return res.status(409).json({ message: "Duplicate field value" });
    }
    return res.status(500).json({ message: error.message });
  }
};

/* ---------- DELETE ---------- */
// DELETE /cases/:id
export const deleteCase = async (req, res) => {
  try {
    const deleted = await Case.findByIdAndDelete(req.params.id);
    if (!deleted) return res.status(404).json({ message: "Case not found" });

    return res.json({ message: "Case deleted successfully" });
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
};
