const mongoose = require("mongoose");

const UserSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true },

    email: {
      type: String,
      required: true,
      unique: true,
      lowercase: true,
      trim: true
    },

    passwordHash: { type: String, required: true },

    isVerified: { type: Boolean, default: false },
    verificationCode: { type: String, default: "" },
    verificationCodeExpires: { type: Date, default: null },
    resetCode: { type: String, default: "" },
    resetCodeExpires: { type: Date, default: null }
  },
  { timestamps: true }
);

module.exports = mongoose.model("User", UserSchema);
