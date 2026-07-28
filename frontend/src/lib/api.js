const BASE = 'api';

async function request(path, options = {}) {
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
}

export const api = {
  members: {
    list: () => request('/members'),
    create: (data) => request('/members', { method: 'POST', body: JSON.stringify(data) }),
    update: (id, data) => request(`/members/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
    remove: (id) => request(`/members/${id}`, { method: 'DELETE' }),
  },
  bills: {
    list: (params = {}) => request(`/bills?${new URLSearchParams(params)}`),
    calendar: (from, to) => request(`/bills/calendar?from=${from}&to=${to}`),
    get: (id) => request(`/bills/${id}`),
    create: (data) => request('/bills', { method: 'POST', body: JSON.stringify(data) }),
    update: (id, data) => request(`/bills/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
    pay: (id, data = {}) => request(`/bills/${id}/pay`, { method: 'POST', body: JSON.stringify(data) }),
    remove: (id) => request(`/bills/${id}`, { method: 'DELETE' }),
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
