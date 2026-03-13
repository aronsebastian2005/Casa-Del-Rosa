const rows = document.getElementById("rows");
const msg = document.getElementById("statusMsg");
const logoutBtn = document.getElementById("logoutBtn");
const totalCount = document.getElementById("totalCount");
const pendingCount = document.getElementById("pendingCount");
const approvedCount = document.getElementById("approvedCount");
const rejectedCount = document.getElementById("rejectedCount");

const API = "http://localhost:5000";

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

async function loadBookings() {
  if (!rows || !msg) return;

  msg.textContent = "Loading bookings...";
  rows.innerHTML = "";

  if (localStorage.getItem("adminLoggedIn") !== "true") {
    window.location.href = "login.html";
    return;
  }

  try {
    const res = await fetch(`${API}/api/bookings`);
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

    updateSummary(data);

    if (data.length === 0) {
      msg.textContent = "No reservations yet.";
      return;
    }

    msg.textContent = `Loaded ${data.length} reservation(s).`;

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

      rows.appendChild(tr);
    });
  } catch (err) {
    console.log(err);
    msg.textContent = err.message;
  }
}

async function approve(id) {
  if (!msg) return;
  msg.textContent = "Approving...";

  try {
    const res = await fetch(`${API}/api/approve/${id}`, {
      method: "PUT"
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
    msg.textContent = err.message;
  }
}

async function reject(id) {
  if (!msg) return;
  msg.textContent = "Rejecting...";

  try {
    const res = await fetch(`${API}/api/reject/${id}`, {
      method: "PUT"
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
    localStorage.removeItem("adminLoggedIn");
    window.location.href = "login.html";
  });
}

loadBookings();
setInterval(loadBookings, 5000);
