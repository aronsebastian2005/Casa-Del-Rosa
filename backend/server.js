const express = require("express");
const mongoose = require("mongoose");
const cors = require("cors");
const multer = require("multer");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const fs = require("fs");
const path = require("path");

function loadEnvFile() {
  const envPath = path.join(__dirname, ".env");

  if (!fs.existsSync(envPath)) {
    return;
  }

  const lines = fs.readFileSync(envPath, "utf8").split(/\r?\n/);

  lines.forEach((line) => {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) return;

    const eqIndex = trimmed.indexOf("=");
    if (eqIndex < 0) return;

    const key = trimmed.slice(0, eqIndex).trim();
    const value = trimmed.slice(eqIndex + 1).trim().replace(/^"(.*)"$/, "$1");

    if (!(key in process.env)) {
      process.env[key] = value;
    }
  });
}

loadEnvFile();

const Booking = require("./models/Booking");
const User = require("./models/user");
const AdminSettings = require("./models/AdminSettings");

const app = express();

const allowedOrigins = new Set([
  "http://localhost:3000",
  "http://localhost:5000",
  "http://127.0.0.1:3000",
  "http://127.0.0.1:5000",
  "https://casa-del-rosa-frontend.onrender.com",
  "https://casa-del-rosa-admin.onrender.com"
]);

app.use(cors({
  origin(origin, callback) {
    if (!origin || allowedOrigins.has(origin)) {
      callback(null, true);
      return;
    }

    callback(new Error(`CORS blocked for origin: ${origin}`));
  }
}));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

const uploadsPath = path.join(__dirname, "uploads");
if (!fs.existsSync(uploadsPath)) {
  fs.mkdirSync(uploadsPath, { recursive: true });
}

app.use("/uploads", express.static(uploadsPath));

const MONGODB_URI = process.env.MONGODB_URI || "";
const JWT_SECRET = process.env.JWT_SECRET || "";
const RESEND_API_KEY = process.env.RESEND_API_KEY || "";
const RESEND_FROM_EMAIL = process.env.RESEND_FROM_EMAIL || "";
const ADMIN_USERNAME = process.env.ADMIN_USERNAME || "admin";
const ADMIN_EMAIL = process.env.ADMIN_EMAIL || "admin@casadelrosa.local";
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || "admin123";
const MANAGER_SECRET = process.env.MANAGER_SECRET || "";
const PORT = Number(process.env.PORT || 5000);

if (!MONGODB_URI || !JWT_SECRET || !RESEND_API_KEY || !RESEND_FROM_EMAIL) {
  console.error("Missing required environment variables. Check backend/.env or hosting env settings.");
  process.exit(1);
}

mongoose.connect(MONGODB_URI)
  .then(() => console.log("✅ MongoDB connected"))
  .catch((err) => console.log("❌ MongoDB error:", err));

async function sendResendEmail({ to, subject, html }) {
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${RESEND_API_KEY}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      from: RESEND_FROM_EMAIL,
      to,
      subject,
      html
    })
  });

  const data = await res.json().catch(() => null);

  if (!res.ok) {
    throw new Error(
      data && data.message
        ? `Resend error: ${data.message}`
        : `Resend request failed (${res.status})`
    );
  }

  console.log("Resend email sent:", {
    to,
    id: data && data.id ? data.id : null
  });

  return data;
}

function auth(req, res, next) {
  const header = req.headers.authorization || "";
  const token = header.startsWith("Bearer ") ? header.slice(7) : null;

  if (!token) {
    return res.status(401).json({ message: "No token" });
  }

  try {
    req.user = jwt.verify(token, JWT_SECRET);
    next();
  } catch (e) {
    return res.status(401).json({ message: "Invalid token" });
  }
}

function adminAuth(req, res, next) {
  const header = req.headers.authorization || "";
  const token = header.startsWith("Bearer ") ? header.slice(7) : null;

  if (!token) {
    return res.status(401).json({ message: "No admin token" });
  }

  try {
    const decoded = jwt.verify(token, JWT_SECRET);

    if (decoded.role !== "admin") {
      return res.status(403).json({ message: "Admin access required" });
    }

    req.admin = decoded;
    next();
  } catch (e) {
    return res.status(401).json({ message: "Invalid admin token" });
  }
}

async function getOrCreateAdminSettings() {
  let settings = await AdminSettings.findOne().sort({ createdAt: 1 });

  if (settings) {
    return settings;
  }

  settings = await AdminSettings.create({
    username: ADMIN_USERNAME,
    email: String(ADMIN_EMAIL).trim().toLowerCase(),
    passwordHash: await bcrypt.hash(ADMIN_PASSWORD, 10)
  });

  return settings;
}

const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    cb(null, uploadsPath);
  },
  filename: function (req, file, cb) {
    cb(null, Date.now() + "-" + file.originalname.replace(/\s+/g, "_"));
  }
});

const upload = multer({
  storage,
  fileFilter: (req, file, cb) => {
    const allowed = ["image/png", "image/jpeg", "image/jpg", "image/webp"];
    if (allowed.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error("Only image files are allowed"));
    }
  },
  limits: {
    fileSize: 5 * 1024 * 1024
  }
});

function generateCode() {
  return String(Math.floor(100000 + Math.random() * 900000));
}

function sendJsonError(res, status, message, error = null) {
  return res.status(status).json(error ? { message, error: String(error) } : { message });
}

function queueVerificationEmail(email, code, name) {
  sendVerificationEmail(email, code, name).catch((err) => {
    console.log("ASYNC VERIFICATION EMAIL ERROR:", err);
  });
}

function normalizeDateOnly(value) {
  const raw = String(value || "").trim();
  if (!raw) return "";

  if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) return raw;

  if (/^\d{4}-\d{2}-\d{2}T/.test(raw)) {
    return raw.slice(0, 10);
  }

  if (/^\d{1,2}\/\d{1,2}\/\d{4}$/.test(raw)) {
    const [mm, dd, yyyy] = raw.split("/").map(Number);
    return `${yyyy}-${String(mm).padStart(2, "0")}-${String(dd).padStart(2, "0")}`;
  }

  return raw.slice(0, 10);
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

function nightsBetween(checkin, checkout) {
  return toDayNumber(checkout) - toDayNumber(checkin);
}

function isWeekend(dateStr) {
  const { year, month, day } = parseDateParts(dateStr);
  const weekday = new Date(Date.UTC(year, month - 1, day)).getUTCDay();
  return weekday === 0 || weekday === 5 || weekday === 6;
}

function computeReservationTotal(checkin, checkout, guests) {
  const WEEKDAY_RATE = 12000;
  const WEEKEND_RATE = 15000;
  const MAX_GUESTS_INCLUDED = 120;
  const EXTRA_GUEST_PRICE = 100;

  const start = toDayNumber(checkin);
  const end = toDayNumber(checkout);
  const nights = end - start;

  let baseTotal = 0;

  for (let i = 0; i < nights; i++) {
    const dateStr = fromDayNumber(start + i);
    baseTotal += isWeekend(dateStr) ? WEEKEND_RATE : WEEKDAY_RATE;
  }

  const extraGuests = guests > MAX_GUESTS_INCLUDED ? guests - MAX_GUESTS_INCLUDED : 0;
  const extraFee = extraGuests * EXTRA_GUEST_PRICE;

  return baseTotal + extraFee;
}

async function sendVerificationEmail(toEmail, code, name) {
  const html = `
    <div style="font-family:Arial,sans-serif;padding:20px;color:#222">
      <h2>Casa Del Rosa Email Verification</h2>
      <p>Hello ${name || "Guest"},</p>
      <p>Your verification code is:</p>
      <div style="font-size:32px;font-weight:bold;letter-spacing:6px;margin:18px 0;color:#ad5028">${code}</div>
      <p>This code will expire in 10 minutes.</p>
      <p>Please enter this code in the verification page to activate your account.</p>
    </div>
  `;

  await sendResendEmail({
    to: toEmail,
    subject: "Your Casa Del Rosa Verification Code",
    html
  });
}

async function sendResetPasswordEmail(toEmail, code, name) {
  const html = `
    <div style="font-family:Arial,sans-serif;padding:20px;color:#222">
      <h2>Casa Del Rosa Password Reset</h2>
      <p>Hello ${name || "Guest"},</p>
      <p>Your password reset code is:</p>
      <div style="font-size:32px;font-weight:bold;letter-spacing:6px;margin:18px 0;color:#ad5028">${code}</div>
      <p>This code will expire in 10 minutes.</p>
      <p>If you did not request a password reset, you can ignore this email.</p>
    </div>
  `;

  await sendResendEmail({
    to: toEmail,
    subject: "Your Casa Del Rosa Password Reset Code",
    html
  });
}

// ---------- AUTH ROUTES ----------
app.post("/api/auth/register", async (req, res) => {
  try {
    const { name, email, password } = req.body;

    if (!name || !email || !password) {
      return sendJsonError(res, 400, "Missing fields");
    }

    const trimmedName = String(name).trim();
    const normalizedEmail = String(email).trim().toLowerCase();

    const strongPassword = /^(?=.*[A-Z])(?=.*[a-z])(?=.*[^A-Za-z0-9]).{8,}$/;
    if (!strongPassword.test(password)) {
      return sendJsonError(
        res,
        400,
        "Password must be at least 8 characters and include 1 uppercase, 1 lowercase, and 1 special character"
      );
    }

    const existingUser = await User.findOne({ email: normalizedEmail });

    const code = generateCode();
    const expires = new Date(Date.now() + 10 * 60 * 1000);

    if (existingUser) {
      if (existingUser.isVerified) {
        return sendJsonError(res, 400, "Email already registered");
      }

      existingUser.name = trimmedName;
      existingUser.passwordHash = await bcrypt.hash(password, 10);
      existingUser.verificationCode = code;
      existingUser.verificationCodeExpires = expires;
      await existingUser.save();
      queueVerificationEmail(normalizedEmail, code, trimmedName);

      return res.json({
        message: "Verification code sent to your email",
        email: normalizedEmail
      });
    }

    const passwordHash = await bcrypt.hash(password, 10);

    await User.create({
      name: trimmedName,
      email: normalizedEmail,
      passwordHash,
      isVerified: false,
      verificationCode: code,
      verificationCodeExpires: expires
    });

    queueVerificationEmail(normalizedEmail, code, trimmedName);

    return res.json({
      message: "Verification code sent to your email",
      email: normalizedEmail
    });
  } catch (err) {
    console.log("REGISTER ERROR:", err);
    return sendJsonError(res, 500, "Register failed", err);
  }
});

app.post("/api/auth/verify-email", async (req, res) => {
  try {
    const { email, code } = req.body;

    if (!email || !code) {
      return sendJsonError(res, 400, "Email and code are required");
    }

    const normalizedEmail = String(email).trim().toLowerCase();
    const user = await User.findOne({ email: normalizedEmail });

    if (!user) {
      return sendJsonError(res, 404, "User not found");
    }

    if (user.isVerified) {
      return res.json({ message: "Email already verified" });
    }

    if (!user.verificationCode || !user.verificationCodeExpires) {
      return sendJsonError(res, 400, "No verification code found");
    }

    if (new Date() > new Date(user.verificationCodeExpires)) {
      return sendJsonError(res, 400, "Verification code expired");
    }

    if (String(user.verificationCode) !== String(code).trim()) {
      return sendJsonError(res, 400, "Invalid verification code");
    }

    user.isVerified = true;
    user.verificationCode = "";
    user.verificationCodeExpires = null;
    await user.save();

    return res.json({ message: "Email verified successfully" });
  } catch (err) {
    console.log("VERIFY ERROR:", err);
    return sendJsonError(res, 500, "Verification failed", err);
  }
});

app.post("/api/auth/resend-code", async (req, res) => {
  try {
    const { email } = req.body;

    if (!email) {
      return sendJsonError(res, 400, "Email is required");
    }

    const normalizedEmail = String(email).trim().toLowerCase();
    const user = await User.findOne({ email: normalizedEmail });

    if (!user) {
      return sendJsonError(res, 404, "User not found");
    }

    if (user.isVerified) {
      return sendJsonError(res, 400, "Email already verified");
    }

    const code = generateCode();
    const expires = new Date(Date.now() + 10 * 60 * 1000);

    user.verificationCode = code;
    user.verificationCodeExpires = expires;
    await user.save();
    await sendVerificationEmail(normalizedEmail, code, user.name);

    return res.json({ message: "New verification code sent to your email" });
  } catch (err) {
    console.log("RESEND ERROR:", err);
    return sendJsonError(res, 500, "Resend failed", err);
  }
});

app.post("/api/auth/forgot-password", async (req, res) => {
  try {
    const { email } = req.body;

    if (!email) {
      return sendJsonError(res, 400, "Email is required");
    }

    const normalizedEmail = String(email).trim().toLowerCase();
    const user = await User.findOne({ email: normalizedEmail });

    if (!user) {
      return sendJsonError(res, 404, "User not found");
    }

    const code = generateCode();
    const expires = new Date(Date.now() + 10 * 60 * 1000);

    user.resetCode = code;
    user.resetCodeExpires = expires;
    await user.save();

    await sendResetPasswordEmail(normalizedEmail, code, user.name);

    return res.json({ message: "Password reset code sent to your email" });
  } catch (err) {
    console.log("FORGOT PASSWORD ERROR:", err);
    return sendJsonError(res, 500, "Failed to send password reset code", err);
  }
});

app.post("/api/auth/reset-password", async (req, res) => {
  try {
    const { email, code, newPassword } = req.body;

    if (!email || !code || !newPassword) {
      return sendJsonError(res, 400, "Email, code, and new password are required");
    }

    const strongPassword = /^(?=.*[A-Z])(?=.*[a-z])(?=.*[^A-Za-z0-9]).{8,}$/;
    if (!strongPassword.test(newPassword)) {
      return sendJsonError(
        res,
        400,
        "Password must be at least 8 characters and include 1 uppercase, 1 lowercase, and 1 special character"
      );
    }

    const normalizedEmail = String(email).trim().toLowerCase();
    const user = await User.findOne({ email: normalizedEmail });

    if (!user) {
      return sendJsonError(res, 404, "User not found");
    }

    if (!user.resetCode || !user.resetCodeExpires) {
      return sendJsonError(res, 400, "No password reset request found");
    }

    if (new Date() > new Date(user.resetCodeExpires)) {
      return sendJsonError(res, 400, "Reset code expired");
    }

    if (String(user.resetCode) !== String(code).trim()) {
      return sendJsonError(res, 400, "Invalid reset code");
    }

    user.passwordHash = await bcrypt.hash(newPassword, 10);
    user.resetCode = "";
    user.resetCodeExpires = null;
    await user.save();

    return res.json({ message: "Password reset successful" });
  } catch (err) {
    console.log("RESET PASSWORD ERROR:", err);
    return sendJsonError(res, 500, "Password reset failed", err);
  }
});

app.post("/api/auth/login", async (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return sendJsonError(res, 400, "Missing fields");
    }

    const user = await User.findOne({ email: String(email).trim().toLowerCase() });

    if (!user) {
      return sendJsonError(res, 400, "Invalid email or password");
    }

    const ok = await bcrypt.compare(password, user.passwordHash);
    if (!ok) {
      return sendJsonError(res, 400, "Invalid email or password");
    }

    if (!user.isVerified) {
      return sendJsonError(res, 403, "Please verify your email first before logging in");
    }

    const token = jwt.sign(
      { id: user._id.toString(), email: user.email, name: user.name },
      JWT_SECRET,
      { expiresIn: "7d" }
    );

    return res.json({
      token,
      user: {
        id: user._id,
        name: user.name,
        email: user.email
      }
    });
  } catch (err) {
    console.log("LOGIN ERROR:", err);
    return sendJsonError(res, 500, "Login failed", err);
  }
});

app.post("/api/admin/login", async (req, res) => {
  try {
    const username = String(req.body.username || "").trim();
    const password = String(req.body.password || "").trim();

    if (!username || !password) {
      return sendJsonError(res, 400, "Username and password are required");
    }

    const settings = await getOrCreateAdminSettings();
    const identifier = username.toLowerCase();
    const matchesIdentity =
      settings.username.toLowerCase() === identifier ||
      settings.email.toLowerCase() === identifier;

    if (!matchesIdentity) {
      return sendJsonError(res, 401, "Invalid admin username or password");
    }

    const ok = await bcrypt.compare(password, settings.passwordHash);
    if (!ok) {
      return sendJsonError(res, 401, "Invalid admin username or password");
    }

    const token = jwt.sign(
      { role: "admin", username: settings.username, email: settings.email },
      JWT_SECRET,
      { expiresIn: "12h" }
    );

    return res.json({
      token,
      admin: {
        username: settings.username,
        email: settings.email
      }
    });
  } catch (err) {
    console.log("ADMIN LOGIN ERROR:", err);
    return sendJsonError(res, 500, "Admin login failed", err);
  }
});

app.get("/api/admin/settings", adminAuth, async (req, res) => {
  try {
    const settings = await getOrCreateAdminSettings();

    return res.json({
      username: settings.username,
      email: settings.email
    });
  } catch (err) {
    console.log("ADMIN SETTINGS LOAD ERROR:", err);
    return sendJsonError(res, 500, "Failed to load admin settings", err);
  }
});

app.put("/api/admin/settings", adminAuth, async (req, res) => {
  try {
    const username = String(req.body.username || "").trim();
    const email = String(req.body.email || "").trim().toLowerCase();
    const newPassword = String(req.body.newPassword || "");
    const managerSecret = String(req.body.managerSecret || "").trim();

    if (!MANAGER_SECRET) {
      return sendJsonError(res, 500, "Manager secret is not configured on the server");
    }

    if (!managerSecret) {
      return sendJsonError(res, 400, "Manager secret is required");
    }

    if (managerSecret !== MANAGER_SECRET) {
      return sendJsonError(res, 403, "Invalid manager secret");
    }

    if (!username || !email) {
      return sendJsonError(res, 400, "Username and email are required");
    }

    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return sendJsonError(res, 400, "Please enter a valid email address");
    }

    const settings = await getOrCreateAdminSettings();
    settings.username = username;
    settings.email = email;

    if (newPassword) {
      const strongPassword = /^(?=.*[A-Z])(?=.*[a-z])(?=.*[^A-Za-z0-9]).{8,}$/;
      if (!strongPassword.test(newPassword)) {
        return sendJsonError(
          res,
          400,
          "Password must be at least 8 characters and include 1 uppercase, 1 lowercase, and 1 special character"
        );
      }

      settings.passwordHash = await bcrypt.hash(newPassword, 10);
    }

    await settings.save();

    return res.json({
      message: "Admin credentials updated successfully",
      admin: {
        username: settings.username,
        email: settings.email
      }
    });
  } catch (err) {
    console.log("ADMIN SETTINGS UPDATE ERROR:", err);
    return sendJsonError(res, 500, "Failed to update admin settings", err);
  }
});

// ---------- BOOKINGS ----------
app.post("/api/book", auth, async (req, res) => {
  try {
    const body = req.body || {};

    const name = String(body.name || req.user.name || "").trim();
    const email = String(body.email || req.user.email || "").trim().toLowerCase();
    const contact = String(body.contact || "").trim();
    const guests = Number(body.guests);
    const checkin = normalizeDateOnly(body.checkin);
    const checkout = normalizeDateOnly(body.checkout);

    if (!name || !email || !contact || !guests || !checkin || !checkout) {
      return sendJsonError(res, 400, "Please complete all booking fields");
    }

    if (isNaN(guests) || guests < 1) {
      return sendJsonError(res, 400, "Guests must be at least 1");
    }

    if (!/^\d{4}-\d{2}-\d{2}$/.test(checkin) || !/^\d{4}-\d{2}-\d{2}$/.test(checkout)) {
      return sendJsonError(res, 400, "Invalid date format");
    }

    if (toDayNumber(checkout) <= toDayNumber(checkin)) {
      return sendJsonError(res, 400, "Checkout must be after check-in");
    }

    const approved = await Booking.find({ status: "Approved" });

    for (const b of approved) {
      const existingCheckin = normalizeDateOnly(b.checkin);
      const existingCheckout = normalizeDateOnly(b.checkout);

      if (toDayNumber(checkin) < toDayNumber(existingCheckout) &&
          toDayNumber(checkout) > toDayNumber(existingCheckin)) {
        return sendJsonError(res, 400, "Selected dates are already reserved");
      }
    }

    const total = computeReservationTotal(checkin, checkout, guests);

    const newBooking = new Booking({
      userId: req.user.id,
      name,
      email,
      contact,
      guests,
      checkin,
      checkout,
      total,
      proof: "",
      paymentMethod: "",
      status: "Pending"
    });

    await newBooking.save();

    return res.json({
      message: "Booking submitted successfully!",
      booking: newBooking
    });
  } catch (err) {
    console.log("BOOK ERROR:", err);
    return sendJsonError(res, 500, "Booking failed", err);
  }
});

app.get("/api/bookings", adminAuth, async (req, res) => {
  try {
    const bookings = await Booking.find().sort({ createdAt: -1 });
    return res.json(bookings);
  } catch (err) {
    return sendJsonError(res, 500, "Failed to load bookings", err);
  }
});

app.put("/api/approve/:id", adminAuth, async (req, res) => {
  try {
    const booking = await Booking.findById(req.params.id);

    if (!booking) {
      return sendJsonError(res, 404, "Booking not found");
    }

    const bookingCheckin = normalizeDateOnly(booking.checkin);
    const bookingCheckout = normalizeDateOnly(booking.checkout);

    const approved = await Booking.find({
      _id: { $ne: booking._id },
      status: "Approved"
    });

    for (const b of approved) {
      const existingCheckin = normalizeDateOnly(b.checkin);
      const existingCheckout = normalizeDateOnly(b.checkout);

      if (toDayNumber(bookingCheckin) < toDayNumber(existingCheckout) &&
          toDayNumber(bookingCheckout) > toDayNumber(existingCheckin)) {
        return sendJsonError(res, 400, "Cannot approve because dates conflict with another approved booking");
      }
    }

    booking.checkin = bookingCheckin;
    booking.checkout = bookingCheckout;
    booking.status = "Approved";
    await booking.save();

    return res.json({ message: "Booking Approved" });
  } catch (err) {
    console.log("APPROVE ERROR:", err);
    return sendJsonError(res, 500, "Approve failed", err);
  }
});

app.put("/api/reject/:id", adminAuth, async (req, res) => {
  try {
    const booking = await Booking.findById(req.params.id);

    if (!booking) {
      return sendJsonError(res, 404, "Booking not found");
    }

    booking.status = "Rejected";
    await booking.save();

    return res.json({ message: "Booking Rejected" });
  } catch (err) {
    console.log("REJECT ERROR:", err);
    return sendJsonError(res, 500, "Reject failed", err);
  }
});

app.get("/api/my-bookings", auth, async (req, res) => {
  try {
    const mine = await Booking.find({ userId: req.user.id }).sort({ createdAt: -1 });
    return res.json(mine);
  } catch (err) {
    return sendJsonError(res, 500, "Failed to load your bookings", err);
  }
});

app.get("/api/approved-dates", async (req, res) => {
  try {
    const approved = await Booking.find({ status: "Approved" });
    const blockedDates = [];

    approved.forEach((b) => {
      const start = toDayNumber(normalizeDateOnly(b.checkin));
      const end = toDayNumber(normalizeDateOnly(b.checkout));

      for (let day = start; day < end; day++) {
        blockedDates.push(fromDayNumber(day));
      }
    });

    return res.json(blockedDates);
  } catch (err) {
    console.log("APPROVED DATES ERROR:", err);
    return sendJsonError(res, 500, "Failed to load approved dates", err);
  }
});

app.put("/api/upload-proof/:id", auth, upload.single("proof"), async (req, res) => {
  try {
    const booking = await Booking.findById(req.params.id);

    if (!booking) {
      return sendJsonError(res, 404, "Booking not found");
    }

    if (String(booking.userId) !== String(req.user.id)) {
      return sendJsonError(res, 403, "Not allowed");
    }

    if (booking.status !== "Approved") {
      return sendJsonError(res, 400, "You can upload proof only after approval");
    }

    if (!req.file) {
      return sendJsonError(res, 400, "Please select a screenshot image");
    }

    const paymentMethod = String(req.body.paymentMethod || "").trim();
    if (!paymentMethod || !["GCash", "PayMaya"].includes(paymentMethod)) {
      return sendJsonError(res, 400, "Please select GCash or PayMaya");
    }

    booking.proof = req.file.filename;
    booking.paymentMethod = paymentMethod;
    await booking.save();

    return res.json({ message: "Payment proof uploaded" });
  } catch (err) {
    console.log("UPLOAD ERROR:", err);
    return sendJsonError(res, 500, "Upload failed", err);
  }
});

app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
