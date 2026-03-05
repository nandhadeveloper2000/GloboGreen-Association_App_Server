const mongoose = require("mongoose");

const kycSchema = new mongoose.Schema(
  {
    owner: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      unique: true,
    },

    aadhaarFrontUrl: String,
    aadhaarBackUrl: String,
    aadhaarPdfUrl: String,

    gstCertUrl: String,
    udyamCertUrl: String,

    status: {
      type: String,
      enum: ["PENDING", "APPROVED", "REJECTED"],
      default: "PENDING",
    },

    remarks: { type: String, default: "" },

    reviewedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
    reviewedAt: Date,
  },
  { timestamps: true }
);

module.exports = mongoose.model("Kyc", kycSchema);
