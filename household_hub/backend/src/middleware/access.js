import db from '../db/index.js';

// Claim an unlinked member profile for whichever HA user is making the
// request, matching by display name the first time we see them. This lets an
// admin revoke a specific person's access later without a separate login
// system -- HA Ingress is still the real authentication boundary.
function resolveMember(req) {
  const { id: haUserId, name: haUserName } = req.haUser;
  if (!haUserId) return null;

  let member = db.prepare('SELECT * FROM members WHERE ha_user_id = ?').get(haUserId);
  if (member) return member;

  if (haUserName) {
    member = db
      .prepare('SELECT * FROM members WHERE ha_user_id IS NULL AND lower(name) = lower(?)')
      .get(haUserName);
    if (member) {
      db.prepare('UPDATE members SET ha_user_id = ? WHERE id = ?').run(haUserId, member.id);
      member.ha_user_id = haUserId;
    }
  }
  return member;
}

export function accessControl(req, res, next) {
  const member = resolveMember(req);
  req.currentMember = member;
  if (member?.access_revoked) {
    return res
      .status(403)
      .json({ error: 'Your access to Household Hub has been removed by a household admin.' });
  }
  next();
}

// Older HA Supervisor versions don't forward user identity on ingress
// requests, so req.currentMember may be unresolvable even in a household
// that has an admin configured. In that case admin-gated actions simply
// aren't available until identity can be resolved -- there's no way to know
// who's asking. Before any admin has ever been designated, allow the action
// through so the household can complete initial setup.
export function requireAdmin(req, res, next) {
  const anyAdminExists = db.prepare('SELECT 1 FROM members WHERE is_admin = 1').get();
  if (!anyAdminExists) return next();
  if (!req.currentMember?.is_admin) {
    return res.status(403).json({ error: 'Admin access required.' });
  }
  next();
}
