const BASE = 'api';

async function request(path, options = {}) {
  try {
    const res = await fetch(`${BASE}${path}`, {
      headers: { 'Content-Type': 'application/json' },
      ...options,
    });
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      throw new Error(body.error || `Request failed: ${res.status}`);
    }
    if (res.status === 204) return null;
    return res.json();
  } catch (err) {
    // Most call sites don't .catch() this (a stale page just keeps its old
    // data), so log here or failures vanish as silent unhandled rejections.
    console.error(`[household-hub] ${options.method || 'GET'} ${path} failed:`, err);
    throw err;
  }
}

export const api = {
  members: {
    list: () => request('/members'),
    me: () => request('/members/me'),
    create: (data) => request('/members', { method: 'POST', body: JSON.stringify(data) }),
    update: (id, data) => request(`/members/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
    setAdmin: (id, is_admin) =>
      request(`/members/${id}/admin`, { method: 'PATCH', body: JSON.stringify({ is_admin }) }),
    setAccess: (id, access_revoked) =>
      request(`/members/${id}/access`, { method: 'PATCH', body: JSON.stringify({ access_revoked }) }),
    remove: (id) => request(`/members/${id}`, { method: 'DELETE' }),
  },
  categories: {
    list: () => request('/categories'),
    create: (name) => request('/categories', { method: 'POST', body: JSON.stringify({ name }) }),
    setDebt: (id, is_debt) =>
      request(`/categories/${id}/debt`, { method: 'PATCH', body: JSON.stringify({ is_debt }) }),
    remove: (id) => request(`/categories/${id}`, { method: 'DELETE' }),
  },
  bills: {
    list: (params = {}) => request(`/bills?${new URLSearchParams(params)}`),
    calendar: (from, to) => request(`/bills/calendar?from=${from}&to=${to}`),
    get: (id) => request(`/bills/${id}`),
    create: (data) => request('/bills', { method: 'POST', body: JSON.stringify(data) }),
    update: (id, data) => request(`/bills/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
    pay: (id, data = {}) => request(`/bills/${id}/pay`, { method: 'POST', body: JSON.stringify(data) }),
    assignPaycheck: (id, paycheck_id) =>
      request(`/bills/${id}/paycheck`, { method: 'PATCH', body: JSON.stringify({ paycheck_id }) }),
    remove: (id) => request(`/bills/${id}`, { method: 'DELETE' }),
  },
  paychecks: {
    list: () => request('/paychecks'),
    unassignedBills: () => request('/paychecks/unassigned-bills'),
    create: (data) => request('/paychecks', { method: 'POST', body: JSON.stringify(data) }),
    update: (id, data) => request(`/paychecks/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
    remove: (id) => request(`/paychecks/${id}`, { method: 'DELETE' }),
  },
  projects: {
    list: () => request('/projects'),
    create: (data) => request('/projects', { method: 'POST', body: JSON.stringify(data) }),
    update: (id, data) => request(`/projects/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
    remove: (id) => request(`/projects/${id}`, { method: 'DELETE' }),
  },
  tasks: {
    list: (params = {}) => request(`/tasks?${new URLSearchParams(params)}`),
    create: (data) => request('/tasks', { method: 'POST', body: JSON.stringify(data) }),
    update: (id, data) => request(`/tasks/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
    remove: (id) => request(`/tasks/${id}`, { method: 'DELETE' }),
  },
  notify: {
    test: (notify_service) => request('/notify/test', { method: 'POST', body: JSON.stringify({ notify_service }) }),
    persons: () => request('/notify/persons'),
  },
};
