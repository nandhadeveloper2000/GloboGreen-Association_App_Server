// server/models/user.model.js
const mongoose = require("mongoose");
const { computeProfilePercent } = require("../utils/profileScore");

/** Generate Registration Number = FULLNAME-CTMA-YEAR-XXX (OWNER only) */
async function generateUniqueRegistrationNumber(name) {
  const year = new Date().getFullYear();

  const cleanedName = (name || "")
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, "");

  const UserModel = mongoose.model("User");

  const count = await UserModel.countDocuments({
    role: "OWNER",
    RegistrationNumber: { $regex: `-${year}-` },
  });

  const nextNumber = String(count + 1).padStart(3, "0");
  const regNo = `${cleanedName}-CTMA-${year}-${nextNumber}`;
  return regNo;
}

const userSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true },
    email: {
      type: String,
      required: true,
      unique: true,
      lowercase: true,
      trim: true,
      minlength: 2,
      maxlength: 250,
    },
    password: {
      type: String,
      select: false,
      default: "",
      required: function () {
        if (this.role === "EMPLOYEE") return false;
        return !this.provider || this.provider === "local";
      },
    },

    mobile: { type: String, default: "", trim: true },
    additionalNumber: { type: String, default: "" },

    avatar: { type: String, default: "" },
    refresh_token: { type: String, default: "" },
    verify_email: { type: Boolean, default: false },

    provider: {
      type: String,
      enum: ["local", "google"],
      default: "local",
    },

    association: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Association",
      default: null,
    },

    address: {
      street: { type: String, default: "" },
      area: { type: String, default: "" },
      city: { type: String, default: "" },
      district: { type: String, default: "" },
      state: { type: String, default: "" },
      pincode: { type: String, default: "" },
    },

    shopName: { type: String, default: "" },
    shopAddress: {
      street: { type: String, default: "" },
      area: { type: String, default: "" },
      city: { type: String, default: "" },
      district: { type: String, default: "" },
      state: { type: String, default: "" },
      pincode: { type: String, default: "" },
    },

    shopFront: { type: String, default: "" },
    shopBanner: { type: String, default: "" },

    shopLocation: {
      type: {
        type: String,
        enum: ["Point"],
      },
      coordinates: {
        type: [Number], // [lng, lat]
      },
    },

    BusinessType: {
      type: String,
      enum: ["RETAIL", "WHOLESALE"],
      default: "RETAIL",
    },

    BusinessCategory: { type: String, default: "" },

    RegistrationNumber: {
      type: String,
      unique: true,
    },

    qrCodeUrl: { type: String, default: "" },

    last_login_date: { type: Date },

    status: {
      type: String,
      enum: ["Active", "Inactive"],
      default: "Active",
    },

    role: {
      type: String,
      enum: ["OWNER", "USER", "EMPLOYEE", "ADMIN"],
      default: "OWNER",
    },

    parentOwner: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null,
    },

    isEmployeeActive: { type: Boolean, default: true },

    // ---- profile status ----
    profilePercent: { type: Number, default: 0 },
    isProfileVerified: { type: Boolean, default: false }, // ✅ OWNER verification
    shopCompleted: { type: Boolean, default: false },

    profileBreakdown: {
      type: mongoose.Schema.Types.Mixed,
      default: null,
    },

    last_otp_verified_at: { type: Date },
    addressUpdatedAt: { type: Date },

    kycStatus: {
      type: String,
      enum: ["NOT_SUBMITTED", "PENDING", "APPROVED", "REJECTED"],
      default: "NOT_SUBMITTED",
    },
    kycId: { type: mongoose.Schema.Types.ObjectId, ref: "Kyc" },
  },
  { timestamps: true }
);

userSchema.index({ shopLocation: "2dsphere" });

userSchema.pre("save", async function (next) {
  try {
    if (!this.isNew) return next();
    if (this.role !== "OWNER") return next();
    if (this.RegistrationNumber && this.RegistrationNumber.trim() !== "") {
      return next();
    }
    const regNo = await generateUniqueRegistrationNumber(this.name);
    this.RegistrationNumber = regNo;
    next();
  } catch (err) {
    next(err);
  }
});

userSchema.pre("save", function (next) {
  if (
    this.shopLocation &&
    (!Array.isArray(this.shopLocation.coordinates) ||
      this.shopLocation.coordinates.length !== 2)
  ) {
    this.shopLocation = undefined;
  }
  next();
});

userSchema.pre("save", function (next) {
  try {
    const score = computeProfilePercent(this);
    this.profilePercent = score.total;
    this.profileBreakdown = score;
    next();
  } catch (err) {
    next(err);
  }
});

const User = mongoose.model("User", userSchema);
module.exports = User;
