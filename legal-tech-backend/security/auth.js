// security/auth.js
import jwt from "jsonwebtoken";

const JWT_SECRET = process.env.JWT_SECRET || "dev-secret-change-me";
const JWT_EXPIRES_IN = process.env.JWT_EXPIRES_IN || "7d";

/** Create a JWT for a user (must include orgId) */
export function signToken(user) {
  return jwt.sign(
    { sub: String(user._id), orgId: String(user.orgId || user._id), role: user.role },
    JWT_SECRET,
    { expiresIn: JWT_EXPIRES_IN }
  );
}

/** Require a valid user token */
export function requireAuth(req, res, next) {
  try {
    const hdr = req.headers.authorization || "";
    const token = hdr.startsWith("Bearer ") ? hdr.slice(7) : req.cookies?.token;
    if (!token) return res.status(401).json({ message: "Unauthorized: no token" });

    const payload = jwt.verify(token, JWT_SECRET);
    if (!payload?.orgId) return res.status(400).json({ message: "orgId missing in token" });

    req.user = { _id: payload.sub, role: payload.role };
    req.orgId = payload.orgId;
    next();
  } catch (err) {
    return res.status(401).json({ message: "Unauthorized or expired token" });
  }
}

/** Allow only specific roles (e.g., Admin) */
export function allowRoles(...roles) {
  return (req, res, next) => {
    if (!req.user?.role || !roles.includes(req.user.role)) {
      return res.status(403).json({ message: "Forbidden" });
    }
    next();
  };
}

/**
 * Allow OCR worker via shared key OR a normal authenticated user.
 * Worker calls must send:  X-OCR-Worker-Key: <key>
 */
export function requireWorkerOrAuth(req, res, next) {
  const workerKey = req.headers["x-ocr-worker-key"];
  if (workerKey && workerKey === process.env.OCR_WORKER_KEY) {
    // trusted worker; skip user auth (you can also read orgId from another header if you want)
    return next();
  }
  return requireAuth(req, res, next);
}
