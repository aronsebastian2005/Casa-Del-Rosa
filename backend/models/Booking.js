const mongoose = require("mongoose");

const BookingSchema = new mongoose.Schema(
  {
    userId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },

    name: { type: String, required: true, trim: true },
    email: { type: String, required: true, trim: true, lowercase: true },
    contact: { type: String, required: true, trim: true },

    guests: { type: Number, required: true, min: 1 },
    eventType: { type: String, default: "", trim: true },
    specialRequests: { type: String, default: "", trim: true },

    checkin: { type: String, required: true },
    checkout: { type: String, required: true },

    total: { type: Number, default: 0 },

    proof: { type: String, default: "" },  // now stores Base64 data URL
    proofMimeType: { type: String, default: "" }, // e.g. image/jpeg
    paymentMethod: { type: String, default: "" },
    paymentReference: { type: String, default: "" },
    paymentStatus: {
      type: String,
      enum: ["Not Started", "Pending Proof", "Proof Uploaded"],
      default: "Not Started"
    },
    paymentSessionExpiresAt: { type: Date, default: null },

    status: {
      type: String,
      enum: ["Pending", "Approved", "Rejected"],
      default: "Pending"
    }
  },
  { timestamps: true }
);

module.exports = mongoose.model("Booking", BookingSchema);