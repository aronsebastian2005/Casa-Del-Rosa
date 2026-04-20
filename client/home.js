function normalizeDateOnly(value) {
  const str = String(value || "").trim();
  return str ? str.slice(0, 10) : "";
}

const PROOF_ALLOWED_TYPES = ["image/png", "image/jpeg", "image/jpg", "image/webp"];
const PROOF_MAX_SIZE = 5 * 1024 * 1024;

function validatePaymentProof(file) {
  if (!file) {
    return "Please upload a screenshot image.";
  }

  if (!PROOF_ALLOWED_TYPES.includes(file.type)) {
    return "Only PNG, JPG, or WEBP screenshot images are allowed.";
  }

  if (file.size > PROOF_MAX_SIZE) {
    return "Screenshot image must be 5MB or smaller.";
  }

  return "";
}

function setupAdminMenu(isLoggedIn) {
  const menu = document.querySelector(".landing-menu");
  const toggleBtn = document.getElementById("menuToggleBtn");
  const adminLink = document.querySelector("#menuDropdown a");

  if (!menu || !toggleBtn) {
    return;
  }

  if (isLoggedIn) {
    // Hide the entire menu when logged in
    if (menu) {
      menu.style.display = "none";
    }
    if (toggleBtn) {
      toggleBtn.style.display = "none";
      toggleBtn.style.visibility = "hidden";
    }
    if (adminLink) {
      adminLink.remove();
    }
    return;
  }

  toggleBtn.addEventListener("click", (event) => {
    event.stopPropagation();
    const isOpen = menu.classList.toggle("open");
    toggleBtn.setAttribute("aria-expanded", isOpen ? "true" : "false");
  });

  document.addEventListener("click", (event) => {
    if (!menu.contains(event.target)) {
      menu.classList.remove("open");
      toggleBtn.setAttribute("aria-expanded", "false");
    }
  });
}

function setupSectionNav() {
  const links = Array.from(document.querySelectorAll(".landing-link"));

  if (!links.length) {
    return;
  }

  const sections = links
    .map((link) => {
      const href = link.getAttribute("href");
      return {
        href,
        link,
        section: document.querySelector(href)
      };
    })
    .filter((item) => item.section);

  const setActive = (href) => {
    links.forEach((link) => {
      link.classList.toggle("is-active", link.getAttribute("href") === href);
    });
  };

  links.forEach((link) => {
    link.addEventListener("click", () => {
      setActive(link.getAttribute("href"));
    });
  });

  const updateActiveFromScroll = () => {
    const viewportAnchor = window.innerHeight * 0.5;
    let bestHref = "#home";
    let bestDistance = Number.POSITIVE_INFINITY;

    sections.forEach((item) => {
      const rect = item.section.getBoundingClientRect();
      const sectionTop = rect.top;
      const sectionBottom = rect.bottom;
      const containsAnchor = sectionTop <= viewportAnchor && sectionBottom >= viewportAnchor;

      if (containsAnchor) {
        const distanceToTop = Math.abs(sectionTop - viewportAnchor);
        if (distanceToTop < bestDistance) {
          bestDistance = distanceToTop;
          bestHref = item.href;
        }
        return;
      }

      const distance = Math.min(
        Math.abs(sectionTop - viewportAnchor),
        Math.abs(sectionBottom - viewportAnchor)
      );

      if (distance < bestDistance) {
        bestDistance = distance;
        bestHref = item.href;
      }
    });

    setActive(bestHref);
  };

  window.addEventListener("scroll", updateActiveFromScroll, { passive: true });
  window.addEventListener("load", updateActiveFromScroll);
  updateActiveFromScroll();
}

function setupLandingActions(isLoggedIn) {
  const reserveTopBtn = document.getElementById("reserveTopBtn");
  const authTopBtn = document.getElementById("authTopBtn");
  const heroAuthBtn = document.getElementById("heroAuthBtn");
  const heroReserveBtn = document.getElementById("heroReserveBtn");

  const goReservation = () => {
    window.location.href = isLoggedIn ? "reservation.html" : "login.html";
  };

  reserveTopBtn.onclick = goReservation;
  heroReserveBtn.onclick = goReservation;

  if (isLoggedIn) {
    authTopBtn.textContent = "Logout";
    heroAuthBtn.textContent = "Dashboard";
    authTopBtn.onclick = logout;
    heroAuthBtn.onclick = () => {
      document.getElementById("memberDashboard").scrollIntoView({ behavior: "smooth" });
    };
    return;
  }

  authTopBtn.textContent = "Login";
  heroAuthBtn.textContent = "Sign Up";
  authTopBtn.onclick = () => {
    window.location.href = "login.html";
  };
  heroAuthBtn.onclick = () => {
    window.location.href = "register.html";
  };
}

async function loadMyBookings() {
  const msg = document.getElementById("msg");
  const rows = document.getElementById("rows");
  const statusBox = document.getElementById("statusBox");
  const paymentSection = document.getElementById("paymentSection");
  const paymentMsg = document.getElementById("paymentMsg");
  const paymentSimulatorMsg = document.getElementById("paymentSimulatorMsg");
  const paymentSimulatorDetails = document.getElementById("paymentSimulatorDetails");
  const sessionCountdown = document.getElementById("sessionCountdown");
  const paymentForm = document.getElementById("paymentForm");
  const paymentMethod = document.getElementById("paymentMethod");
  const paymentProof = document.getElementById("paymentProof");
  const gcashBox = document.getElementById("gcashBox");
  const paymayaBox = document.getElementById("paymayaBox");
  let paymentSession = null;
  let countdownInterval = null;

  function startSessionCountdown(expiresAt) {
    if (countdownInterval) clearInterval(countdownInterval);
    const updateCountdown = () => {
      const now = new Date();
      const expireTime = new Date(expiresAt);
      const diff = expireTime - now;

      if (diff <= 0) {
        sessionCountdown.textContent = "❌ Session expired. Open simulator again.";
        sessionCountdown.style.color = "#d9534f";
        clearInterval(countdownInterval);
        paymentSession = null;
        gcashBox.style.display = "none";
        paymayaBox.style.display = "none";
        return;
      }

      const minutes = Math.floor(diff / 60000);
      const seconds = Math.floor((diff % 60000) / 1000);
      const color = diff < 300000 ? "#d9534f" : "#5cb85c";
      sessionCountdown.style.color = color;
      sessionCountdown.textContent = `⏱️ Session expires in: ${minutes}m ${seconds}s`;
    };

    updateCountdown();
    sessionCountdown.style.display = "block";
    countdownInterval = setInterval(updateCountdown, 1000);
  }

  function clearSessionCountdown() {
    if (countdownInterval) clearInterval(countdownInterval);
    sessionCountdown.style.display = "none";
    sessionCountdown.textContent = "";
  }

  try {
    const data = await apiFetch("/api/my-bookings");

    rows.innerHTML = "";
    paymentSection.style.display = "none";
    paymentMsg.textContent = "";
    paymentSimulatorMsg.textContent = "";
    paymentSimulatorDetails.textContent = "";
    clearSessionCountdown();
    gcashBox.style.display = "none";
    paymayaBox.style.display = "none";

    if (!data || data.length === 0) {
      statusBox.innerHTML = '<span class="badge warn">No reservation yet</span>';
      msg.textContent = "";
      paymentForm.onsubmit = null;
      return;
    }

    const latest = data[0];
    const status = (latest.status || "Pending").toLowerCase();

    const badge =
      status === "approved" ? '<span class="badge good">Approved</span>' :
      status === "rejected" ? '<span class="badge bad">Rejected</span>' :
      '<span class="badge warn">Pending</span>';

    statusBox.innerHTML = `
      ${badge}
      <div class="small" style="margin-top:8px">
        Latest: ${normalizeDateOnly(latest.checkin)} -> ${normalizeDateOnly(latest.checkout)}
      </div>
    `;

    if (status === "approved") {
      paymentSection.style.display = "block";
      paymentSimulatorMsg.textContent = "👇 Select a payment method and proceed to merchant checkout";
      paymentSimulatorMsg.style.color = "#03a9f4";
      gcashBox.style.display = "none";
      paymayaBox.style.display = "none";
      paymentSimulatorDetails.textContent = "";
      clearSessionCountdown();
    }

    data.forEach((booking) => {
      const bookingStatus = (booking.status || "Pending").toLowerCase();
      const statusBadge =
        bookingStatus === "approved" ? '<span class="badge good">Approved</span>' :
        bookingStatus === "rejected" ? '<span class="badge bad">Rejected</span>' :
        '<span class="badge warn">Pending</span>';

      const tr = document.createElement("tr");
      tr.innerHTML = `
        <td>${normalizeDateOnly(booking.checkin)}</td>
        <td>${normalizeDateOnly(booking.checkout)}</td>
        <td>${booking.guests ?? "-"}</td>
        <td>P${Number(booking.total || 0).toLocaleString()}</td>
        <td>${statusBadge}</td>
      `;
      rows.appendChild(tr);
    });

    // Old payment simulator function - no longer used
    // Payment buttons are now direct links

    paymentForm.onsubmit = async (e) => {
      e.preventDefault();
      paymentMsg.textContent = "📤 Submitting payment proof...";
      paymentMsg.style.color = "#03a9f4";

      try {
        if (!paymentMethod.value) {
          throw new Error("Please select GCash or PayMaya payment method.");
        }

        // Verify booking still has active payment session
        const currentBooking = data[0];
        if (!currentBooking.paymentReference) {
          throw new Error("No active payment session. Please open the payment simulator first.");
        }

        if (currentBooking.paymentMethod !== paymentMethod.value) {
          throw new Error("Payment method mismatch. Please open the simulator again.");
        }

        const proofFile = paymentProof.files && paymentProof.files[0] ? paymentProof.files[0] : null;
        const proofError = validatePaymentProof(proofFile);

        if (proofError) {
          throw new Error(proofError);
        }

        const now = new Date();
        const expireTime = new Date(currentBooking.paymentSessionExpiresAt);
        if (now > expireTime) {
          throw new Error("Your payment session has expired (30-minute limit). Please open a new session.");
        }

        const fd = new FormData();
        fd.append("proof", proofFile);
        fd.append("paymentMethod", paymentMethod.value);
        fd.append("paymentReference", currentBooking.paymentReference);

        const result = await apiFetch(`/api/upload-proof/${latest._id}`, {
          method: "PUT",
          body: fd
        });

        paymentMsg.textContent = result.message || "✅ Payment proof submitted successfully!";
        paymentMsg.style.color = "#5cb85c";
        paymentForm.reset();
        paymentMethod.value = "";
        paymentSimulatorMsg.textContent = "";
        paymentSimulatorDetails.textContent = "";
        clearSessionCountdown();
        gcashBox.style.display = "none";
        paymayaBox.style.display = "none";
      } catch (err) {
        paymentMsg.textContent = `❌ ${err.message}`;
        paymentMsg.style.color = "#d9534f";
      }
    };
  } catch (e) {
    msg.textContent = e.message;
    statusBox.innerHTML = `<span class="badge bad">Error</span><div class="small">${e.message}</div>`;
  }
}

function setupScrollAnimations() {
  const observerOptions = {
    threshold: 0.15
  };

  const observer = new IntersectionObserver((entries) => {
    entries.forEach((entry) => {
      if (entry.isIntersecting) {
        entry.target.classList.add("active");
      }
    });
  }, observerOptions);

  // Apply '.reveal' class to sections and images automatically
  const targets = document.querySelectorAll("section, .landing-card, .gallery img, .feature-item");
  targets.forEach((el) => {
    el.classList.add("reveal");
    observer.observe(el);
  });
}

(async function () {
  const isLoggedIn = Boolean(getToken());
  setupAdminMenu(isLoggedIn);
  setupSectionNav();
  setupLandingActions(isLoggedIn);
  
  // Initialize animations
  setTimeout(() => {
    setupScrollAnimations();
  }, 100);

  if (!isLoggedIn) {
    return;
  }

  document.getElementById("memberDashboard").style.display = "block";
  await loadMyBookings();
  setInterval(loadMyBookings, 5000);
})();
