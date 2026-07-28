// Home Assistant's Ingress proxy sits in front of this app, so by the time a
// request reaches us the user has already authenticated with Home Assistant.
// We don't render a login form or issue our own sessions/tokens.
//
// Newer HA Supervisor versions forward the authenticated user on ingress
// requests via these headers -- we read them if present (useful for
// audit logging), but never rely on them for authorization since HA itself
// is the gate.
export function ingressContext(req, _res, next) {
  req.haUser = {
    id: req.headers['x-remote-user-id'] || null,
    name: req.headers['x-remote-user-name'] || null,
  };
  next();
}
