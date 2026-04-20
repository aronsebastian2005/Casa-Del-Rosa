const express = require("express");
const mongoose = require("mongoose");
const cors = require("cors");
const multer = require("multer");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const nodemailer = require("nodemailer");
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

const app = express();

const allowedOrigins = new Set([
  "http://localhost:3000",
  "http://localhost:8080",
  "http://localhost:5000",
  "http://127.0.0.1:3000",
  "http://127.0.0.1:8080",
  "http://127.0.0.1:5000",
  "http://127.0.0.1:5500",
  "http://localhost:5500",
  "https://casa-del-rosa-frontend.onrender.com",
  "https://casa-del-rosa-admin.onrender.com"
]);

const extraAllowedOrigins = String(process.env.ALLOWED_ORIGINS || "")
  .split(",")
  .map((value) => value.trim())
  .filter(Boolean);

extraAllowedOrigins.forEach((origin) => {
  allowedOrigins.add(origin);
});

function isAllowedOrigin(origin) {
  if (!origin || allowedOrigins.has(origin)) {
    return true;
  }

  return /^https:\/\/[a-z0-9-]+\.vercel\.app$/i.test(origin);
}

const corsOptions = {
  origin(origin, callback) {
    if (isAllowedOrigin(origin)) {
      callback(null, true);
      return;
    }

    callback(new Error(`CORS blocked for origin: ${origin}`));
  },
  optionsSuccessStatus: 200
};

app.use((req, res, next) => {
  const origin = req.headers.origin;

  if (origin && isAllowedOrigin(origin)) {
    res.header("Access-Control-Allow-Origin", origin);
    res.header("Vary", "Origin");
    res.header("Access-Control-Allow-Headers", "Origin, X-Requested-With, Content-Type, Accept, Authorization");
    res.header("Access-Control-Allow-Methods", "GET,POST,PUT,DELETE,OPTIONS");
  }

  if (req.method === "OPTIONS") {
    res.sendStatus(200);
    return;
  }

  next();
});

app.use(cors(corsOptions));
app.use(express.json({ limit: "10mb" }));
app.use(express.urlencoded({ extended: true, limit: "10mb" }));

const MONGODB_URI = process.env.MONGODB_URI || "";
const JWT_SECRET = process.env.JWT_SECRET || "";
const SMTP_HOST = process.env.SMTP_HOST || "";
const SMTP_PORT = Number(process.env.SMTP_PORT || 465);
const SMTP_SECURE = String(process.env.SMTP_SECURE || "true").toLowerCase() !== "false";
const SMTP_USER = process.env.SMTP_USER || "";
const SMTP_PASS = process.env.SMTP_PASS || "";
const SMTP_FROM_EMAIL = process.env.SMTP_FROM_EMAIL || "";
const PORT = Number(process.env.PORT || 5000);

if (!MONGODB_URI || !JWT_SECRET || !SMTP_HOST || !SMTP_USER || !SMTP_PASS || !SMTP_FROM_EMAIL) {
  console.error("Missing required environment variables. Check backend/.env or hosting env settings.");
  process.exit(1);
}

const mailer = nodemailer.createTransport({
  host: SMTP_HOST,
  port: SMTP_PORT,
  secure: SMTP_SECURE,
  auth: {
    user: SMTP_USER,
    pass: SMTP_PASS
  }
});

mongoose.connect(MONGODB_URI)
  .then(() => console.log("✅ MongoDB connected"))
  .catch((err) => console.log("❌ MongoDB error:", err));

async function sendEmail({ to, subject, html }) {
  try {
    const info = await mailer.sendMail({
      from: SMTP_FROM_EMAIL,
      to,
      subject,
      html
    });

    console.log("✅ SMTP email sent:", {
      to,
      messageId: info.messageId || null
    });

    return info;
  } catch (err) {
    console.error("❌ SMTP SEND FAILED:", {
      error: err.message,
      code: err.code,
      to,
      subject,
      smtpUser: SMTP_USER,
      smtpHost: SMTP_HOST
    });
    throw err;
  }
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

// ✅ CHANGED: memory storage instead of disk storage
const upload = multer({
  storage: multer.memoryStorage(),
  fileFilter: (req, file, cb) => {
    const allowed = ["image/png", "image/jpeg", "image/jpg", "image/webp"];
    if (allowed.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error("Only PNG, JPG, or WEBP screenshot images are allowed."));
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
    console.error("❌ VERIFICATION EMAIL ERROR:", err.message || err);
    console.error("Email details:", { to: email, subject: "Your Casa Del Rosa Verification Code" });
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

function getTodayDateOnly() {
  return normalizeDateOnly(new Date().toISOString());
}

function validateReservationDates(checkin, checkout) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(checkin) || !/^\d{4}-\d{2}-\d{2}$/.test(checkout)) {
    return "Invalid date format";
  }

  const today = getTodayDateOnly();

  if (toDayNumber(checkin) < toDayNumber(today)) {
    return `Check-in cannot be earlier than today (${today})`;
  }

  if (toDayNumber(checkout) <= toDayNumber(checkin)) {
    return "Checkout must be after check-in";
  }

  return "";
}

function createPaymentReference(paymentMethod) {
  const prefix = paymentMethod === "GCash" ? "GCSH" : "PYMY";
  const randomPart = Math.random().toString(36).slice(2, 8).toUpperCase();
  return `${prefix}-${Date.now()}-${randomPart}`;
}

function getPaymentSimulationDetails(paymentMethod, reference) {
  if (paymentMethod === "GCash") {
    return {
      accountName: "Casa Del Rosa GCash ",
      accountNumber: "0917-555-0148",
      instructions: `Send the reservation payment in the , then upload your proof using reference ${reference}.`
    };
  }

  return {
    accountName: "Casa Del Rosa PayMaya ",
    accountNumber: "0998-555-0264",
    instructions: `Complete the PayMaya  checkout, then upload your proof using reference ${reference}.`
  };
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

  await sendEmail({
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

  await sendEmail({
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

// ---------- BOOKINGS ----------
app.post("/api/book", auth, async (req, res) => {
  try {
    const body = req.body || {};

    const name = String(body.name || req.user.name || "").trim();
    const email = String(body.email || req.user.email || "").trim().toLowerCase();
    const contact = String(body.contact || "").trim();
    const guests = Number(body.guests);
    const eventType = String(body.eventType || "").trim();
    const specialRequests = String(body.specialRequests || "").trim();
    const checkin = normalizeDateOnly(body.checkin);
    const checkout = normalizeDateOnly(body.checkout);

    if (!name || !email || !contact || !guests || !checkin || !checkout) {
      return sendJsonError(res, 400, "Please complete all booking fields");
    }

    if (isNaN(guests) || guests < 1) {
      return sendJsonError(res, 400, "Guests must be at least 1");
    }

    const dateError = validateReservationDates(checkin, checkout);
    if (dateError) {
      return sendJsonError(res, 400, dateError);
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
      eventType,
      specialRequests,
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

app.get("/api/bookings", async (req, res) => {
  try {
    const bookings = await Booking.find().sort({ createdAt: -1 });
    return res.json(bookings);
  } catch (err) {
    return sendJsonError(res, 500, "Failed to load bookings", err);
  }
});

app.put("/api/approve/:id", async (req, res) => {
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

app.put("/api/reject/:id", async (req, res) => {
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

app.post("/api/payment-simulator/session/:id", auth, async (req, res) => {
  try {
    const booking = await Booking.findById(req.params.id);

    if (!booking) {
      return sendJsonError(res, 404, "Booking not found");
    }

    if (String(booking.userId) !== String(req.user.id)) {
      return sendJsonError(res, 403, "Not allowed");
    }

    if (booking.status !== "Approved") {
      return sendJsonError(res, 400, "You can only open a payment simulator after approval");
    }

    const paymentMethod = String(req.body.paymentMethod || "").trim();
    if (!["GCash", "PayMaya"].includes(paymentMethod)) {
      return sendJsonError(res, 400, "Please choose GCash or PayMaya");
    }

    const reference = createPaymentReference(paymentMethod);
    const expiresAt = new Date(Date.now() + 30 * 60 * 1000);
    const details = getPaymentSimulationDetails(paymentMethod, reference);

    booking.paymentMethod = paymentMethod;
    booking.paymentReference = reference;
    booking.paymentStatus = "Pending Proof";
    booking.paymentSessionExpiresAt = expiresAt;
    await booking.save();

    return res.json({
      bookingId: booking._id,
      paymentMethod,
      reference,
      expiresAt,
      ...details
    });
  } catch (err) {
    console.log("PAYMENT SIMULATOR ERROR:", err);
    return sendJsonError(res, 500, "Failed to create payment session", err);
  }
});

// ✅ CHANGED: proof is now served directly from MongoDB as Base64
app.get("/api/proof/:id", auth, async (req, res) => {
  try {
    const booking = await Booking.findById(req.params.id);

    if (!booking) {
      return sendJsonError(res, 404, "Booking not found");
    }

    const isAdmin = req.user.role === "admin";
    const isOwner = String(booking.userId) === String(req.user.id);
    if (!isAdmin && !isOwner) {
      return sendJsonError(res, 403, "Not authorized");
    }

    if (!booking.proof) {
      return sendJsonError(res, 404, "No proof file found");
    }

    // proof is already a Base64 data URL, redirect to it
    return res.json({ proofDataUrl: booking.proof });
  } catch (err) {
    console.error("PROOF ERROR:", err);
    return sendJsonError(res, 500, "Failed to get proof", err);
  }
});

// ✅ CHANGED: saves image as Base64 in MongoDB instead of disk
app.put("/api/upload-proof/:id", auth, (req, res) => {
  upload.single("proof")(req, res, async (uploadErr) => {
    if (uploadErr) {
      if (uploadErr instanceof multer.MulterError && uploadErr.code === "LIMIT_FILE_SIZE") {
        return sendJsonError(res, 400, "Screenshot image must be 5MB or smaller.");
      }

      return sendJsonError(res, 400, uploadErr.message || "Upload failed. Please try again.");
    }

    try {
      const booking = await Booking.findById(req.params.id);

      if (!booking) {
        return sendJsonError(res, 404, "Booking not found.");
      }

      if (String(booking.userId) !== String(req.user.id)) {
        return sendJsonError(res, 403, "You are not authorized to upload proof for this booking.");
      }

      if (booking.status !== "Approved") {
        return sendJsonError(res, 400, "You can only upload proof after your reservation is approved.");
      }

      if (!req.file) {
        return sendJsonError(res, 400, "Please select a screenshot image to upload.");
      }

      const paymentMethod = String(req.body.paymentMethod || "").trim();
      if (!paymentMethod || !["GCash", "PayMaya"].includes(paymentMethod)) {
        return sendJsonError(res, 400, "Invalid payment method. Please select GCash or PayMaya.");
      }

      const paymentReference = String(req.body.paymentReference || "").trim();
      if (!paymentReference) {
        return sendJsonError(res, 400, "Payment reference is missing. Please open the payment simulator again.");
      }

      if (paymentReference !== booking.paymentReference) {
        return sendJsonError(res, 400, "Payment reference does not match. Your session may have expired. Please open the payment simulator again.");
      }

      if (!booking.paymentSessionExpiresAt) {
        return sendJsonError(res, 400, "No active payment session. Please open the payment simulator first.");
      }

      if (new Date() > new Date(booking.paymentSessionExpiresAt)) {
        return sendJsonError(res, 400, "Your payment simulator session has expired (30 minutes limit). Please open a new session to try again.");
      }

      // ✅ Convert file buffer to Base64 data URL and save to MongoDB
      const base64 = req.file.buffer.toString("base64");
      const dataUrl = `data:${req.file.mimetype};base64,${base64}`;

      booking.proof = dataUrl;
      booking.proofMimeType = req.file.mimetype;
      booking.paymentMethod = paymentMethod;
      booking.paymentReference = paymentReference;
      booking.paymentStatus = "Proof Uploaded";
      await booking.save();

      console.log("✅ Payment proof saved to MongoDB:", { bookingId: booking._id, paymentMethod });
      return res.json({ message: "✅ Payment proof uploaded successfully. Our team will verify it shortly." });
    } catch (err) {
      console.error("❌ UPLOAD ERROR:", err.message || err);
      return sendJsonError(res, 500, "Upload failed. Please try again.", err);
    }
  });
});

app.listen(PORT, () => console.log(`Server running on port ${PORT}`));