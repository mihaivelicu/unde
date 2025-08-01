// src/api.js
const API_BASE =
  (typeof process !== 'undefined' &&
    process.env &&
    process.env.REACT_APP_API_BASE &&
    process.env.REACT_APP_API_BASE.replace(/\/$/, '')) ||
  '';

const asJson = async (res) => {
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    const err = new Error(`HTTP ${res.status} ${text}`);
    err.status = res.status;
    throw err;
  }
  return res.json();
};

async function uploadPhotos(groupId, files) {
  if (!files || files.length === 0) return [];
  const fd = new FormData();
  fd.append('group_id', String(groupId));
  for (const f of files) fd.append('files', f);
  const res = await fetch(`${API_BASE}/api/uploads`, { method: 'POST', body: fd });
  const data = await asJson(res);
  return data.urls || [];
}

export const api = {
  getGroups: () => fetch(`${API_BASE}/api/groups`).then(asJson),
  getGroupDetails: (slug) =>
    fetch(`${API_BASE}/api/groups/${encodeURIComponent(slug)}`).then(asJson),

  createPin: (payload) =>
    fetch(`${API_BASE}/api/pins`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    }).then(asJson),

  upvotePin: (id) =>
    fetch(`${API_BASE}/api/pins/${id}/upvote`, { method: 'POST' }).then(asJson),

  updatePin: (id, payload) =>
    fetch(`${API_BASE}/api/pins/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    }).then(asJson),

  deleteGroup: (id) =>
    fetch(`${API_BASE}/api/groups/${id}`, { method: 'DELETE' }).then(asJson),

  updateGroup: (id, payload) =>
    fetch(`${API_BASE}/api/groups/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    }).then(asJson),

  // ---- Statuses CRUD ----
  createStatus: (groupId, payload) =>
    fetch(`${API_BASE}/api/groups/${groupId}/statuses`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    }).then(asJson),

  updateStatus: (statusId, payload) =>
    fetch(`${API_BASE}/api/statuses/${statusId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    }).then(asJson),

  deleteStatus: (statusId) =>
    fetch(`${API_BASE}/api/statuses/${statusId}`, {
      method: 'DELETE',
    }).then(asJson),

  uploadPhotos,
};
