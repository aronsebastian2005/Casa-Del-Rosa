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

    checkin: { type: String, required: true },   // YYYY-MM-DD
    checkout: { type: String, required: true },  // YYYY-MM-DD

    total: { type: Number, default: 0 },

    proof: { type: String, default: "" },
    paymentMethod: { type: String, default: "" },

    status: {
      type: String,
      enum: ["Pending", "Approved", "Rejected"],
      default: "Pending"
    }
  },
  { timestamps: true }
);

module.exports = mongoose.model("Booking", BookingSchema);
