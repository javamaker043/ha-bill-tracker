// Talks to Home Assistant's Core API through the Supervisor proxy.
// Inside an official add-on, SUPERVISOR_TOKEN is injected automatically and
// grants access to http://supervisor/core/api/* -- no separate credentials
// or exposed long-lived access token needed.
const SUPERVISOR_TOKEN = process.env.SUPERVISOR_TOKEN;
const CORE_API = 'http://supervisor/core/api';

function authHeaders() {
  return {
    Authorization: `Bearer ${SUPERVISOR_TOKEN}`,
    'Content-Type': 'application/json',
  };
}

export const haAvailable = () => Boolean(SUPERVISOR_TOKEN);

/**
 * Call any Home Assistant notify.* service (or any other domain/service).
 * e.g. callService('notify', 'mobile_app_ty_phone', { message, title })
 */
export async function callService(domain, service, data = {}) {
  if (!haAvailable()) {
    console.warn(`[ha] SUPERVISOR_TOKEN not set, skipping ${domain}.${service}`, data);
    return { skipped: true };
  }
  const res = await fetch(`${CORE_API}/services/${domain}/${service}`, {
    method: 'POST',
    headers: authHeaders(),
    body: JSON.stringify(data),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`HA service call failed (${res.status}): ${text}`);
  }
  return res.json().catch(() => ({}));
}

/** Send a notification via a full "notify.xxx" service string, e.g. "notify.mobile_app_ty". */
export async function notify(notifyService, title, message) {
  const [domain, service] = (notifyService || 'notify.notify').split('.');
  return callService(domain, service, { title, message });
}

/** Fetch HA person.* entities so members can optionally be linked for notify targeting. */
export async function getPersons() {
  if (!haAvailable()) return [];
  const res = await fetch(`${CORE_API}/states`, { headers: authHeaders() });
  if (!res.ok) return [];
  const states = await res.json();
  return states.filter((s) => s.entity_id.startsWith('person.'));
}
