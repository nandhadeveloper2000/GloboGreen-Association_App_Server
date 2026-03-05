// server/models/subscription.model.js
const mongoose = require("mongoose");

const ExtraFieldSchema = new mongoose.Schema(
  {
    key: { type: String, required: true, trim: true },
    value: { type: String, default: "", trim: true },
  },
  { _id: false }
);

const SubscriptionSchema = new mongoose.Schema(
  {
    member: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    monthKey: { type: String, required: true }, // YYYY-MM

    subscriptionAmount: { type: Number, required: true, default: 0 },
    meetingAmount: { type: Number, default: 0 },

    status: { type: String, enum: ["PAID", "FAILED"], default: "PAID" },
    paidDate: { type: Date, default: Date.now },

    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: "User" },

    paymentMode: { type: String, enum: ["CASH", "UPI", "BANK", "CARD"], default: "CASH" },
    referenceNo: { type: String, default: "" },

    attachmentUrl: { type: String, default: "" },
    notes: { type: String, default: "" },

    // ✅ NEW: dynamic extra fields
    extraFields: { type: [ExtraFieldSchema], default: [] },
  },
  { timestamps: true }
);

SubscriptionSchema.index({ member: 1, monthKey: 1 }, { unique: true });

module.exports = mongoose.model("Subscription", SubscriptionSchema);
