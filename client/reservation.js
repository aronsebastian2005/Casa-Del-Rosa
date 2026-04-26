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

function formatPeso(amount) {
  return `P${Number(amount || 0).toLocaleString()}`;
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

function getTodayDateOnly() {
  return ymd(new Date());
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

function validateReservationDates(checkin, checkout) {
  const today = getTodayDateOnly();

  if (!checkin || !checkout) {
    return "";
  }

  if (toDayNumber(checkin) < toDayNumber(today)) {
    return `Check-in cannot be earlier than today (${today}).`;
  }

  if (toDayNumber(checkout) <= toDayNumber(checkin)) {
    return "Checkout must be after check-in.";
  }

  if (rangeHasBlockedDates(checkin, checkout)) {
    return "Selected dates include reserved dates.";
  }

  return "";
}

function getStoredUser() {
  const token = getToken();
  if (!token) return null;

  try {
    const payload = token.split(".")[1];
    const normalized = payload.replace(/-/g, "+").replace(/_/g, "/");
    const json = decodeURIComponent(
      atob(normalized)
        .split("")
        .map((char) => `%${(`00${char.charCodeAt(0).toString(16)}`).slice(-2)}`)
        .join("")
    );
    return JSON.parse(json);
  } catch {
    return null;
  }
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
    const blockedDay = blocked.has(key);

    const el = document.createElement("div");
    el.className = "day" + (blockedDay ? " blocked" : "");
    el.innerHTML = `<div class="d">${d}</div><div class="t">${blockedDay ? "Reserved" : "Available"}</div>`;
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
  const baseBreakdown = document.getElementById("baseBreakdown");
  const baseAmount = document.getElementById("baseAmount");
  const extraBreakdown = document.getElementById("extraBreakdown");
  const extraAmount = document.getElementById("extraAmount");

  if (!checkin || !checkout || !guests) {
    totalDisplay.textContent = "P0";
    totalInput.value = "0";
    baseBreakdown.textContent = "Select dates to see the rate breakdown";
    baseAmount.textContent = "P0";
    extraBreakdown.textContent = "Extra guests will appear here if you go above 120.";
    extraAmount.textContent = "P0";
    priceMsg.textContent = "";
    return 0;
  }

  const dateError = validateReservationDates(checkin, checkout);

  if (dateError) {
    totalDisplay.textContent = "P0";
    totalInput.value = "0";
    baseBreakdown.textContent = dateError;
    baseAmount.textContent = "P0";
    extraBreakdown.textContent = "Please adjust your dates first.";
    extraAmount.textContent = "P0";
    priceMsg.textContent = dateError;
    return 0;
  }

  const start = toDayNumber(checkin);
  const end = toDayNumber(checkout);
  const nights = end - start;
  let baseTotal = 0;
  let weekdayNights = 0;
  let weekendNights = 0;

  for (let i = 0; i < nights; i++) {
    const dateStr = fromDayNumber(start + i);
    if (isWeekend(dateStr)) {
      weekendNights += 1;
      baseTotal += WEEKEND_RATE;
    } else {
      weekdayNights += 1;
      baseTotal += WEEKDAY_RATE;
    }
  }

  const extraGuests = guests > MAX_GUESTS_INCLUDED ? guests - MAX_GUESTS_INCLUDED : 0;
  const extraFee = extraGuests * EXTRA_GUEST_PRICE;
  const finalTotal = baseTotal + extraFee;

  const nightLabel = nights === 1 ? "night" : "nights";
  const stayParts = [];
  if (weekdayNights) stayParts.push(`${weekdayNights} weekday`);
  if (weekendNights) stayParts.push(`${weekendNights} weekend`);

  totalDisplay.textContent = formatPeso(finalTotal);
  totalInput.value = String(finalTotal);
  baseBreakdown.textContent = `${nights} ${nightLabel} • ${stayParts.join(" + ")}`;
  baseAmount.textContent = formatPeso(baseTotal);

  if (extraGuests > 0) {
    extraBreakdown.textContent = `Extra guests above ${MAX_GUESTS_INCLUDED}: ${extraGuests} × ${formatPeso(EXTRA_GUEST_PRICE)}`;
    extraAmount.textContent = formatPeso(extraFee);
    priceMsg.textContent = `Base stay plus ${extraGuests} extra guest(s).`;
  } else {
    extraBreakdown.textContent = `No extra guest charge. Up to ${MAX_GUESTS_INCLUDED} guests included.`;
    extraAmount.textContent = "P0";
    priceMsg.textContent = "Included guests: up to 120.";
  }

  return finalTotal;
}

function setFieldError(fieldId, message) {
  const input = document.getElementById(fieldId);
  const field = input ? input.closest(".reservation-field") : null;
  const errorEl = document.getElementById(`${fieldId}Error`);

  if (!input || !field || !errorEl) {
    return;
  }

  const hasError = Boolean(message);
  field.classList.toggle("is-invalid", hasError);
  input.setAttribute("aria-invalid", hasError ? "true" : "false");
  errorEl.textContent = message || "";
}

function clearFieldError(fieldId) {
  setFieldError(fieldId, "");
}

function validateField(fieldId) {
  const input = document.getElementById(fieldId);
  if (!input) return "";

  const rawValue = input.value;
  const value = typeof rawValue === "string" ? rawValue.trim() : rawValue;
  let message = "";

  if (fieldId === "name") {
    if (!value) {
      message = "Please enter your full name.";
    }
  } else if (fieldId === "email") {
    if (!value) {
      message = "Please enter your email address.";
    } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)) {
      message = "Please enter a valid email address.";
    }
  } else if (fieldId === "contact") {
    if (!value) {
      message = "Please enter your contact number.";
    } else if (String(value).replace(/\D/g, "").length < 10) {
      message = "Please enter a valid contact number.";
    }
  } else if (fieldId === "guests") {
    if (!value) {
      message = "Please enter the number of guests.";
    } else if (Number(value) < 1) {
      message = "Guests must be at least 1.";
    }
  } else if (fieldId === "eventType") {
    if (!value) {
      message = "Please select an event type.";
    }
  } else if (fieldId === "checkin") {
    if (!value) {
      message = "Please choose a check-in date.";
    }
  } else if (fieldId === "checkout") {
    if (!value) {
      message = "Please choose a check-out date.";
    }
  }

  setFieldError(fieldId, message);
  return message;
}

function validateDateFields(checkin, checkout) {
  const dateError = validateReservationDates(checkin, checkout);

  if (!dateError) {
    if (checkin) clearFieldError("checkin");
    if (checkout) clearFieldError("checkout");
    return "";
  }

  if (dateError.toLowerCase().includes("check-in")) {
    setFieldError("checkin", dateError);
    clearFieldError("checkout");
  } else {
    setFieldError("checkout", dateError);
    if (checkin) clearFieldError("checkin");
  }

  return dateError;
}

function validateReservationForm(form) {
  const requiredFieldIds = ["name", "email", "contact", "checkin", "checkout", "guests", "eventType"];
  let firstError = "";

  requiredFieldIds.forEach((fieldId) => {
    const error = validateField(fieldId);
    if (!firstError && error) {
      firstError = error;
    }
  });

  const checkin = normalizeDateOnly(form.checkin.value);
  const checkout = normalizeDateOnly(form.checkout.value);

  if (checkin && checkout) {
    const dateError = validateDateFields(checkin, checkout);
    if (!firstError && dateError) {
      firstError = dateError;
    }
  }

  return firstError;
}

function redirectToSuccessPage(payload) {
  const params = new URLSearchParams({
    name: payload.name,
    email: payload.email
  });

  window.location.href = `request-received?${params.toString()}`;
}

(async function () {
  if (!getToken()) {
    window.location.href = "login.html";
    return;
  }

  const storedUser = getStoredUser();
  if (storedUser) {
    const nameInput = document.getElementById("name");
    const emailInput = document.getElementById("email");

    if (storedUser.name) {
      nameInput.value = storedUser.name;
    }

    if (storedUser.email) {
      emailInput.value = storedUser.email;
    }
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
  ["name", "email", "contact", "guests"].forEach((fieldId) => {
    document.getElementById(fieldId).addEventListener("input", () => {
      validateField(fieldId);
    });
  });
  ["checkin", "checkout", "eventType"].forEach((fieldId) => {
    document.getElementById(fieldId).addEventListener("change", () => {
      validateField(fieldId);
      const checkin = normalizeDateOnly(document.getElementById("checkin").value);
      const checkout = normalizeDateOnly(document.getElementById("checkout").value);
      if (checkin && checkout) {
        validateDateFields(checkin, checkout);
      }
    });
  });

  const today = getTodayDateOnly();
  document.getElementById("checkin").min = today;
  document.getElementById("checkout").min = today;
  document.getElementById("checkin").addEventListener("change", (event) => {
    document.getElementById("checkout").min = event.target.value || today;
  });

  const form = document.getElementById("bookingForm");
  const msg = document.getElementById("msg");

  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    msg.textContent = "Submitting your reservation request...";

    const validationError = validateReservationForm(form);
    if (validationError) {
      msg.textContent = validationError;
      return;
    }

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
        eventType: form.eventType.value.trim(),
        specialRequests: form.specialRequests.value.trim(),
        checkin: normalizeDateOnly(form.checkin.value),
        checkout: normalizeDateOnly(form.checkout.value),
        total
      };

      const dateError = validateReservationDates(payload.checkin, payload.checkout);
      if (dateError) {
        validateDateFields(payload.checkin, payload.checkout);
        msg.textContent = dateError;
        return;
      }

      await apiFetch("/api/book", {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify(payload)
      });

      msg.textContent = "";
      form.reset();
      calculateTotal();
      redirectToSuccessPage(payload);
    } catch (err) {
      msg.textContent = err.message;
    }
  });
})();
