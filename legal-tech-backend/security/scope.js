// security/scope.js
export function caseScopeFilter(req) {
  const orgPart = req.orgId ? { orgId: req.orgId } : {};

  // Admins can access all cases in the org
  if (req.user?.role === "Admin") return orgPart;

  // Lawyers: only cases they are connected to
  const uid = req.user?._id;
  if (!uid) return { _id: null }; // ensures no match if somehow missing

  return {
    ...orgPart,
    $or: [
      { "assignedTo.userId": uid },
      { "parties.lawyer": uid },
      { createdBy: uid },
    ],
  };
}
