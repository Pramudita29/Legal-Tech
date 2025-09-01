// security/auth.js
import jwt from "jsonwebtoken";

const JWT_SECRET = process.env.JWT_SECRET || "dev-secret-change-me";
const JWT_EXPIRES_IN = process.env.JWT_EXPIRES_IN || "7d";

/** Create a JWT for a user */
export function signToken(user) {
  return jwt.sign(
    { sub: String(user._id), tenantId: String(user.tenantId), role: user.role },
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
    if (!payload?.tenantId) return res.status(400).json({ message: "tenantId missing in token" });

    req.user = { _id: payload.sub, role: payload.role };
    req.tenantId = payload.tenantId;
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

/** Allow OCR worker via shared key OR a normal authenticated user */
export function requireWorkerOrAuth(req, res, next) {
  const workerKey = req.headers["supersecret-678"];
  if (workerKey && workerKey === process.env.OCR_WORKER_KEY) {
    // trusted worker; no tenant enforced here—if needed, you can carry tenant in header too
    return next();
  }
  return requireAuth(req, res, next);
}
