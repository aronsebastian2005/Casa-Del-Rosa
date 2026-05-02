function getConfiguredApiBase() {
  const runtimeValue =
    window.CASA_DEL_ROSA_API_URL ||
    document.querySelector('meta[name="api-base-url"]')?.content ||
    localStorage.getItem("casaDelRosaApiUrl") ||
    "";

  if (runtimeValue) {
    return runtimeValue.replace(/\/+$/, "");
  }

  if (window.location.hostname === "localhost" || window.location.hostname === "127.0.0.1") {
    return "http://localhost:5000";
  }

  if (/\.vercel\.app$/i.test(window.location.hostname)) {
    return "";
  }

  return "https://casa-del-rosa-backend.onrender.com";
}

const API = getConfiguredApiBase();

function setToken(token) {
  localStorage.setItem("token", token);
}

function getToken() {
  return localStorage.getItem("token");
}

function logout() {
  localStorage.removeItem("token");
  window.location.href = "home.html";
}

async function apiFetch(path, options = {}) {
  const headers = options.headers || {};
  const token = getToken();

  if (token) {
    headers["Authorization"] = "Bearer " + token;
  }

  options.headers = headers;

  const res = await fetch(API + path, options);
  const text = await res.text();

  let data = null;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = text;
  }

  if (!res.ok) {
    const details = data && data.error ? ` (${data.error})` : "";
    const msg = data && data.message ? data.message + details : "Request failed: " + res.status;
    throw new Error(msg);
  }

  return data;
}
