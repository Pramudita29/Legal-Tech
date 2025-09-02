import Case from "../models/Case.js";

/* ---------- small utils ---------- */
const pick = (obj, fields) =>
  Object.fromEntries(Object.entries(obj || {}).filter(([k]) => fields.includes(k)));

const parseIntOr = (v, d) => {
  const n = parseInt(v, 10);
  return Number.isFinite(n) && n > 0 ? n : d;
};

const genCaseNumber = () => {
  const yr = new Date().getFullYear();
  const rand = Math.random().toString(36).slice(2, 6).toUpperCase();
  return `${yr}-CV-${rand}`;
};

const toCourt = (v = "") =>
  ({ district: "District", high: "High", supreme: "Supreme" }[String(v).toLowerCase()] || v);

const normalizeCaseType = (cat, sub) => (cat && sub) ? `${cat} - ${sub}` : sub;

/* ---------- access scope helper (Admin: all in org; Lawyer: assigned/party/creator) ---------- */
const caseScopeFilter = (req) => {
  const orgPart = req.orgId ? { orgId: req.orgId } : {};
  if (req.user?.role === "Admin") return orgPart;
  const uid = req.user?._id;
  if (!uid) return { _id: null }; // no access
  return {
    ...orgPart,
    $or: [
      { "assignedTo.userId": uid },
      { "parties.lawyer": uid },
      { createdBy: uid },
    ],
  };
};

/* ---------- CREATE ---------- */
// POST /cases
export const createCase = async (req, res) => {
  try {
    const allowed = [
      "caseNumber","caseTitle","courtLevel","caseType","status",
      "parentCaseId","appealCaseId","parties","dates","hearings","documents","assignedTo"
    ];
    const payload = pick(req.body, allowed);

    // org ownership & creator
    if (req.orgId) payload.orgId = req.orgId;
    if (req.user?._id) payload.createdBy = req.user._id;

    if (payload.courtLevel) payload.courtLevel = toCourt(payload.courtLevel);

    const { caseTypeCategory } = req.body;
    if (payload.caseType) payload.caseType = normalizeCaseType(caseTypeCategory, payload.caseType);

    if (req.body.clientName) {
      payload.parties ??= [];
      payload.parties.push({ name: req.body.clientName, role: "Plaintiff", contactInfo: req.body.contact });
    }

    if (req.body.courtDate) {
      const d = new Date(req.body.courtDate);
      if (!Number.isNaN(d.valueOf())) payload.dates = { ...(payload.dates || {}), nextHearingAD: d };
    }

    if (!payload.caseNumber) payload.caseNumber = genCaseNumber();

    const created = await Case.create(payload);
    return res.status(201).json(created);
  } catch (error) {
    if (error?.code === 11000) return res.status(409).json({ message: "Case number already exists" });
    return res.status(500).json({ message: error.message });
  }
};

/* ---------- LIST ---------- */
// GET /cases?q=&status=&courtLevel=&caseType=&page=&limit=&sort=
export const getCases = async (req, res) => {
  try {
    const { q, status, courtLevel, caseType, page = "1", limit = "20", sort = "-updatedAt" } = req.query;
    const pageNum = parseIntOr(page, 1);
    const limitNum = Math.min(parseIntOr(limit, 20), 100);

    const filter = caseScopeFilter(req);
    if (status) filter.status = status;
    if (courtLevel) filter.courtLevel = toCourt(courtLevel);
    if (caseType) filter.caseType = caseType;

    if (q && String(q).trim()) {
      const rx = new RegExp(String(q).trim().replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i");
      filter.$or = [ ...(filter.$or || []), { caseNumber: rx }, { caseTitle: rx }, { "parties.name": rx } ];
    }

    const cursor = Case.find(filter)
      .sort(sort).skip((pageNum - 1) * limitNum).limit(limitNum)
      .select("-__v")
      .populate({ path: "parties.lawyer", select: "name email role" })
      .populate({ path: "documents", select: "documentType storage.key storage.mimeType createdAt" })
      .lean();

    const [items, total] = await Promise.all([cursor, Case.countDocuments(filter)]);
    return res.json({ page: pageNum, limit: limitNum, total, items });
  } catch (error) { return res.status(500).json({ message: error.message }); }
};

/* ---------- GET ONE ---------- */
// GET /cases/:id
export const getCaseById = async (req, res) => {
  try {
    const filter = { _id: req.params.id, ...caseScopeFilter(req) };
    const doc = await Case.findOne(filter)
      .select("-__v")
      .populate({ path: "parties.lawyer", select: "name email role" })
      .populate({ path: "documents", select: "documentType storage.key storage.mimeType createdAt" });

    if (!doc) return res.status(404).json({ message: "Case not found" });
    return res.json(doc);
  } catch (error) { return res.status(500).json({ message: error.message }); }
};

/* ---------- UPDATE ---------- */
// PATCH /cases/:id
export const updateCase = async (req, res) => {
  try {
    const allowed = [
      "caseTitle","courtLevel","caseType","status","parentCaseId","appealCaseId",
      "parties","dates","hearings","documents","assignedTo"
    ];
    const updates = pick(req.body, allowed);
    if (updates.courtLevel) updates.courtLevel = toCourt(updates.courtLevel);
    const { caseTypeCategory } = req.body;
    if (updates.caseType) updates.caseType = normalizeCaseType(caseTypeCategory, updates.caseType);

    if (req.body.clientName) {
      updates.parties ??= [];
      updates.parties.push({ name: req.body.clientName, role: "Plaintiff", contactInfo: req.body.contact });
    }
    if (req.body.courtDate) {
      const d = new Date(req.body.courtDate);
      if (!Number.isNaN(d.valueOf())) updates.dates = { ...(updates.dates || {}), nextHearingAD: d };
    }

    const filter = { _id: req.params.id, ...caseScopeFilter(req) };
    const updated = await Case.findOneAndUpdate(filter, updates, { new: true, runValidators: true })
      .populate({ path: "parties.lawyer", select: "name email role" })
      .populate({ path: "documents", select: "documentType storage.key storage.mimeType createdAt" });

    if (!updated) return res.status(404).json({ message: "Case not found" });
    return res.json(updated);
  } catch (error) {
    if (error?.code === 11000) return res.status(409).json({ message: "Duplicate field value" });
    return res.status(500).json({ message: error.message });
  }
};

/* ---------- DELETE (Admin only; router enforces role) ---------- */
export const deleteCase = async (req, res) => {
  try {
    const filter = { _id: req.params.id, ...(req.orgId ? { orgId: req.orgId } : {}) };
    const deleted = await Case.findOneAndDelete(filter);
    if (!deleted) return res.status(404).json({ message: "Case not found" });
    return res.json({ message: "Case deleted successfully" });
  } catch (error) { return res.status(500).json({ message: error.message }); }
};
