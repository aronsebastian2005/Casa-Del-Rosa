const express = require("express");
const mongoose = require("mongoose");
const cors = require("cors");
const multer = require("multer");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const nodemailer = require("nodemailer");
const fs = require("fs");
const path = require("path");

const Booking = require("./models/Booking");
const User = require("./models/user");

const app = express();

app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

const uploadsPath = path.join(__dirname, "uploads");
if (!fs.existsSync(uploadsPath)) {
  fs.mkdirSync(uploadsPath, { recursive: true });
}

app.use("/uploads", express.static(uploadsPath));

mongoose.connect("mongodb+srv://aronsebastian890_db_user:Paulseb16_2005@cluster0.nqsatyk.mongodb.net/?appName=Cluster0")
  .then(() => console.log("✅ MongoDB connected"))
  .catch((err) => console.log("❌ MongoDB error:", err));

const JWT_SECRET = "CASA_DEL_ROSA_SECRET_2026";

const EMAIL_USER = "aronsebastian890@gmail.com";
const EMAIL_PASS = "noix thyi btzj bljy";

const transporter = nodemailer.createTransport({
  service: "gmail",
  auth: {
    user: EMAIL_USER,
    pass: EMAIL_PASS
  }
});

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
  const MAX_GUESTS_INCLUDED = 50;
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

  await transporter.sendMail({
    from: `"Casa Del Rosa" <${EMAIL_USER}>`,
    to: toEmail,
    subject: "Your Casa Del Rosa Verification Code",
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

      console.log("Verification code for", normalizedEmail, "is", code);

      return res.json({
        message: "Registered successfully. Check server console for verification code.",
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

    await sendVerificationEmail(normalizedEmail, code, trimmedName);

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

    console.log("Resend verification code for", normalizedEmail, "is", code);

    return res.json({ message: "New verification code generated. Check server console." });
  } catch (err) {
    console.log("RESEND ERROR:", err);
    return sendJsonError(res, 500, "Resend failed", err);
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

app.listen(5000, () => console.log("✅ Server running on port 5000"));