const rows = document.getElementById("rows");
const msg = document.getElementById("statusMsg");
const logoutBtn = document.getElementById("logoutBtn");
const totalCount = document.getElementById("totalCount");
const pendingCount = document.getElementById("pendingCount");
const approvedCount = document.getElementById("approvedCount");
const rejectedCount = document.getElementById("rejectedCount");
let hasLoadedOnce = false;
let lastBookingsSnapshot = "";
let isRefreshing = false;

const API =
  window.location.hostname === "localhost" || window.location.hostname === "127.0.0.1"
    ? "http://localhost:5000"
    : "https://casa-del-rosa.onrender.com";

function badgeClass(status) {
  const normalized = (status || "Pending").toLowerCase();
  if (normalized === "approved") return "badge approved";
  if (normalized === "rejected") return "badge rejected";
  return "badge pending";
}

function normalizeDateOnly(value) {
  const str = String(value || "").trim();
  return str ? str.slice(0, 10) : "";
}

function updateSummary(bookings) {
  if (!totalCount) return;

  const pending = bookings.filter((booking) => (booking.status || "Pending").toLowerCase() === "pending").length;
  const approved = bookings.filter((booking) => (booking.status || "").toLowerCase() === "approved").length;
  const rejected = bookings.filter((booking) => (booking.status || "").toLowerCase() === "rejected").length;

  totalCount.textContent = String(bookings.length);
  pendingCount.textContent = String(pending);
  approvedCount.textContent = String(approved);
  rejectedCount.textContent = String(rejected);
}

function restoreScrollPosition(scrollY) {
  window.requestAnimationFrame(() => {
    window.scrollTo({ top: scrollY, behavior: "auto" });
  });
}

function getAdminToken() {
  return localStorage.getItem("adminToken");
}

function logoutAdmin() {
  localStorage.removeItem("adminToken");
  localStorage.removeItem("adminUsername");
  window.location.href = "login.html";
}

async function loadBookings(options = {}) {
  if (!rows || !msg) return;
  if (isRefreshing) return;

  const adminToken = getAdminToken();

  if (!adminToken) {
    logoutAdmin();
    return;
  }

  const { silent = false } = options;

  if (!hasLoadedOnce && !silent) {
    msg.textContent = "Loading bookings...";
  }

  try {
    isRefreshing = true;
    const res = await fetch(`${API}/api/bookings`, {
      headers: {
        Authorization: `Bearer ${adminToken}`
      }
    });
    const text = await res.text();

    let data;
    try {
      data = JSON.parse(text);
    } catch {
      throw new Error("Bookings API did not return JSON");
    }

    if (!res.ok) {
      throw new Error(data.message || `Load failed (${res.status})`);
    }

    if (!Array.isArray(data)) {
      throw new Error("Unexpected bookings response");
    }

    const snapshot = JSON.stringify(data);
    updateSummary(data);

    if (data.length === 0) {
      if (!silent || !hasLoadedOnce) {
        msg.textContent = "No reservations yet.";
      }
      const scrollY = window.scrollY;
      rows.replaceChildren();
      hasLoadedOnce = true;
      lastBookingsSnapshot = snapshot;
      restoreScrollPosition(scrollY);
      return;
    }

    if (snapshot === lastBookingsSnapshot) {
      if (!silent || !hasLoadedOnce) {
        msg.textContent = `Loaded ${data.length} reservation(s).`;
      }
      hasLoadedOnce = true;
      return;
    }

    const scrollY = window.scrollY;
    const fragment = document.createDocumentFragment();

    data.forEach((booking) => {
      const tr = document.createElement("tr");
      const proofUrl = booking.proof ? `${API}/uploads/${booking.proof}` : "";

      tr.innerHTML = `
        <td>${booking.name || ""}</td>
        <td>${booking.email || ""}</td>
        <td>${booking.contact || ""}</td>
        <td>${booking.guests || ""}</td>
        <td>${normalizeDateOnly(booking.checkin)}</td>
        <td>${normalizeDateOnly(booking.checkout)}</td>
        <td>P${Number(booking.total || 0).toLocaleString()}</td>
        <td>${booking.paymentMethod || "-"}</td>
        <td>${proofUrl ? `<a class="proofLink" href="${proofUrl}" target="_blank">View</a>` : "-"}</td>
        <td><span class="${badgeClass(booking.status)}">${booking.status || "Pending"}</span></td>
        <td>
          <div class="actions">
            <button class="btn btnA" data-id="${booking._id}" type="button">Approve</button>
            <button class="btn btnR" data-id="${booking._id}" type="button">Reject</button>
          </div>
        </td>
      `;

      fragment.appendChild(tr);
    });

    rows.replaceChildren(fragment);
    if (!silent || !hasLoadedOnce) {
      msg.textContent = `Loaded ${data.length} reservation(s).`;
    }
    hasLoadedOnce = true;
    lastBookingsSnapshot = snapshot;
    restoreScrollPosition(scrollY);
  } catch (err) {
    console.log(err);
    if (/token/i.test(err.message) || /access/i.test(err.message)) {
      logoutAdmin();
      return;
    }
    msg.textContent = err.message;
  } finally {
    isRefreshing = false;
  }
}

async function approve(id) {
  if (!msg) return;
  msg.textContent = "Approving...";

  try {
    const adminToken = getAdminToken();
    const res = await fetch(`${API}/api/approve/${id}`, {
      method: "PUT",
      headers: {
        Authorization: `Bearer ${adminToken}`
      }
    });

    const text = await res.text();

    let data;
    try {
      data = JSON.parse(text);
    } catch {
      throw new Error(`Approve request failed (${res.status})`);
    }

    if (!res.ok) {
      throw new Error(data.message || `Approve failed (${res.status})`);
    }

    msg.textContent = data.message || "Approved!";
    await loadBookings();
  } catch (err) {
    console.log(err);
    if (/token/i.test(err.message) || /access/i.test(err.message)) {
      logoutAdmin();
      return;
    }
    msg.textContent = err.message;
  }
}

async function reject(id) {
  if (!msg) return;
  msg.textContent = "Rejecting...";

  try {
    const adminToken = getAdminToken();
    const res = await fetch(`${API}/api/reject/${id}`, {
      method: "PUT",
      headers: {
        Authorization: `Bearer ${adminToken}`
      }
    });

    const text = await res.text();

    let data;
    try {
      data = JSON.parse(text);
    } catch {
      throw new Error(`Reject request failed (${res.status})`);
    }

    if (!res.ok) {
      throw new Error(data.message || `Reject failed (${res.status})`);
    }

    msg.textContent = data.message || "Rejected!";
    await loadBookings();
  } catch (err) {
    console.log(err);
    if (/token/i.test(err.message) || /access/i.test(err.message)) {
      logoutAdmin();
      return;
    }
    msg.textContent = err.message;
  }
}

if (rows) {
  rows.addEventListener("click", (event) => {
    const btn = event.target;
    if (btn.classList.contains("btnA")) approve(btn.dataset.id);
    if (btn.classList.contains("btnR")) reject(btn.dataset.id);
  });
}

if (logoutBtn) {
  logoutBtn.addEventListener("click", () => {
    logoutAdmin();
  });
}

loadBookings();
setInterval(() => {
  loadBookings({ silent: true });
}, 5000);
