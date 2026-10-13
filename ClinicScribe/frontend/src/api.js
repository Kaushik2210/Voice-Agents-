// The API key (if the server sets API_KEY) lives only in sessionStorage,
// so it is gone when the tab closes and never ends up in the built bundle.
const KEY = "clinicscribe.apiKey";

function headers(extra = {}) {
  let key = "";
  try {
    key = sessionStorage.getItem(KEY) || "";
  } catch {
    /* storage unavailable: continue without a key */
  }
  return key ? { "X-API-Key": key, ...extra } : extra;
}

async function request(path, options = {}) {
  const res = await fetch(path, { ...options, headers: headers(options.headers) });
  if (res.status === 401) {
    const key = window.prompt("This server requires an API key:");
    if (key) {
      try {
        sessionStorage.setItem(KEY, key);
      } catch {
        /* ignore */
      }
      return request(path, options);
    }
  }
  if (!res.ok) {
    let detail = res.statusText;
    try {
      detail = (await res.json()).detail || detail;
    } catch {
      /* non-JSON error body */
    }
    throw new Error(typeof detail === "string" ? detail : JSON.stringify(detail));
  }
  return res.status === 204 ? null : res;
}

const json = async (path, options) => (await request(path, options)).json();
const text = async (path) => (await request(path)).text();

export const api = {
  health: () => fetch("/health").then((r) => r.json()),
  list: () => json("/api/consultations"),
  get: (id) => json(`/api/consultations/${id}`),
  create: (form) => json("/api/consultations", { method: "POST", body: form }),
  edit: (id, sections) =>
    json(`/api/consultations/${id}/note`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ sections }),
    }),
  approve: (id) => json(`/api/consultations/${id}/approve`, { method: "POST" }),
  remove: (id) => request(`/api/consultations/${id}`, { method: "DELETE" }),
  exportMarkdown: (id) => text(`/api/consultations/${id}/export.md`),
};
