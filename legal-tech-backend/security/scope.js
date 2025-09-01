// security/scope.js
export function caseScopeFilter(req) {
  const tenantPart = req.tenantId ? { tenantId: req.tenantId } : {};

  // Admins can access all cases in the tenant
  if (req.user?.role === "Admin") return tenantPart;

  // Lawyers: only cases they are connected to
  const uid = req.user?._id;
  if (!uid) return { _id: null }; // ensures no match if somehow missing

  return {
    ...tenantPart,
    $or: [
      { "assignedTo.userId": uid },
      { "parties.lawyer": uid },
      { createdBy: uid },
    ],
  };
}
