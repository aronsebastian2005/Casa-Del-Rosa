let blocked = new Set();
let current = new Date();

const WEEKDAY_RATE = 12000;
const WEEKEND_RATE = 15000;
const MAX_GUESTS_INCLUDED = 120;
const EXTRA_GUEST_PRICE = 100;

function normalizeDateOnly(value) {
  const str = String(value || "").trim();
  return str ? str.slice(0, 10) : "";
}

function parseDateParts(dateStr) {
  const normalized = normalizeDateOnly(dateStr);
  const [year, month, day] = normalized.split("-").map(Number);
  return { year, month, day };
}

function toDayNumber(dateStr) {
  const { year, month, day } = parseDateParts(dateStr);
  return Math.floor(Date.UTC(year, month - 1, day) / 86400000);
}

function fromDayNumber(dayNumber) {
  const d = new Date(dayNumber * 86400000);
  const yyyy = d.getUTCFullYear();
  const mm = String(d.getUTCMonth() + 1).padStart(2, "0");
  const dd = String(d.getUTCDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

function ymd(d) {
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

function isWeekend(dateStr) {
  const { year, month, day } = parseDateParts(dateStr);
  const weekday = new Date(Date.UTC(year, month - 1, day)).getUTCDay();
  return weekday === 0 || weekday === 5 || weekday === 6;
}

function rangeHasBlockedDates(checkin, checkout) {
  const start = toDayNumber(checkin);
  const end = toDayNumber(checkout);

  for (let day = start; day < end; day++) {
    if (blocked.has(fromDayNumber(day))) return true;
  }
  return false;
}

async function loadBlocked() {
  const dates = await apiFetch("/api/approved-dates");
  blocked = new Set((dates || []).map(normalizeDateOnly));
}

function renderCalendar() {
  const cal = document.getElementById("cal");
  const title = document.getElementById("calTitle");

  const year = current.getFullYear();
  const month = current.getMonth();

  const first = new Date(year, month, 1);
  const last = new Date(year, month + 1, 0);

  title.textContent = first.toLocaleString(undefined, { month: "long", year: "numeric" });
  cal.innerHTML = "";

  const headers = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
  headers.forEach((h) => {
    const el = document.createElement("div");
    el.className = "day muted";
    el.innerHTML = `<div class="d">${h}</div>`;
    cal.appendChild(el);
  });

  for (let i = 0; i < first.getDay(); i++) {
    const el = document.createElement("div");
    el.className = "day muted";
    cal.appendChild(el);
  }

  for (let d = 1; d <= last.getDate(); d++) {
    const dt = new Date(year, month, d);
    const key = ymd(dt);
    const isBlocked = blocked.has(key);

    const el = document.createElement("div");
    el.className = "day" + (isBlocked ? " blocked" : "");
    el.innerHTML = `<div class="d">${d}</div><div class="t">${isBlocked ? "Reserved" : "Available"}</div>`;
    cal.appendChild(el);
  }
}

function calculateTotal() {
  const checkin = normalizeDateOnly(document.getElementById("checkin").value);
  const checkout = normalizeDateOnly(document.getElementById("checkout").value);
  const guests = parseInt(document.getElementById("guests").value || "0", 10);

  const totalDisplay = document.getElementById("totalDisplay");
  const totalInput = document.getElementById("totalInput");
  const priceMsg = document.getElementById("priceMsg");

  if (!checkin || !checkout || !guests) {
    totalDisplay.textContent = "₱0";
    totalInput.value = "0";
    priceMsg.textContent = "";
    return 0;
  }

  if (toDayNumber(checkout) <= toDayNumber(checkin)) {
    totalDisplay.textContent = "₱0";
    totalInput.value = "0";
    priceMsg.textContent = "Checkout must be after check-in.";
    return 0;
  }

  if (rangeHasBlockedDates(checkin, checkout)) {
    totalDisplay.textContent = "₱0";
    totalInput.value = "0";
    priceMsg.textContent = "Selected dates include reserved dates.";
    return 0;
  }

  const nights = toDayNumber(checkout) - toDayNumber(checkin);
  let baseTotal = 0;

  for (let i = 0; i < nights; i++) {
    const dateStr = fromDayNumber(toDayNumber(checkin) + i);
    baseTotal += isWeekend(dateStr) ? WEEKEND_RATE : WEEKDAY_RATE;
  }

  const extraGuests = guests > MAX_GUESTS_INCLUDED ? guests - MAX_GUESTS_INCLUDED : 0;
  const extraFee = extraGuests * EXTRA_GUEST_PRICE;
  const finalTotal = baseTotal + extraFee;

  totalDisplay.textContent = "₱" + finalTotal.toLocaleString();
  totalInput.value = String(finalTotal);

  priceMsg.textContent = extraGuests > 0
    ? `Extra guest charge: ₱${extraFee.toLocaleString()} for ${extraGuests} guest(s).`
    : `Included guests: up to ${MAX_GUESTS_INCLUDED}.`;

  return finalTotal;
}

(async function () {
  if (!getToken()) {
    window.location.href = "login.html";
    return;
  }

  document.getElementById("prevBtn").onclick = () => {
    current = new Date(current.getFullYear(), current.getMonth() - 1, 1);
    renderCalendar();
  };

  document.getElementById("nextBtn").onclick = () => {
    current = new Date(current.getFullYear(), current.getMonth() + 1, 1);
    renderCalendar();
  };

  try {
    await loadBlocked();
    renderCalendar();
  } catch (e) {
    document.getElementById("calTitle").textContent = "Calendar failed: " + e.message;
  }

  document.getElementById("checkin").addEventListener("change", calculateTotal);
  document.getElementById("checkout").addEventListener("change", calculateTotal);
  document.getElementById("guests").addEventListener("input", calculateTotal);

  const form = document.getElementById("bookingForm");
  const msg = document.getElementById("msg");

  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    msg.textContent = "Submitting...";

    const total = calculateTotal();
    if (!total) {
      msg.textContent = "Please fix your reservation details first.";
      return;
    }

    try {
      const payload = {
        name: form.name.value.trim(),
        email: form.email.value.trim(),
        contact: form.contact.value.trim(),
        guests: Number(form.guests.value),
        checkin: normalizeDateOnly(form.checkin.value),
        checkout: normalizeDateOnly(form.checkout.value),
        total
      };

      await apiFetch("/api/book", {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify(payload)
      });

      msg.textContent = "✅ Reservation request submitted. Wait for admin approval.";
      form.reset();
      document.getElementById("totalDisplay").textContent = "₱0";
      document.getElementById("totalInput").value = "0";
      document.getElementById("priceMsg").textContent = "";

      setTimeout(() => window.location.href = "home.html", 1000);
    } catch (err) {
      msg.textContent = err.message;
    }
  });
})();
