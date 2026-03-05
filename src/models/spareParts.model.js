const mongoose = require("mongoose");

const SparePartItemSchema = new mongoose.Schema(
  {
    partKey: { type: String, required: true },
    title: { type: String, default: "" },
    description: { type: String, default: "" },
    imageUrl: { type: String, default: "" },
  },
  { _id: false }
);

const SparePartsRequestSchema = new mongoose.Schema(
  {
    modelId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "PhoneModel",
      required: true,
      index: true,
    },

    ownerId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },

    ownerShopName: String,
    ownerName: String,
    ownerRegistrationNumber: String,

    items: { type: [SparePartItemSchema], default: [] },

    status: {
      type: String,
      enum: ["DRAFT", "SUBMITTED"],
      default: "SUBMITTED",
      index: true,
    },
  },
  { timestamps: true }
);

/**
 * ✅ GUARANTEE:
 * only ONE SUBMITTED request per owner+model
 */
SparePartsRequestSchema.index(
  { ownerId: 1, modelId: 1, status: 1 },
  { unique: true, partialFilterExpression: { status: "SUBMITTED" } }
);

module.exports = mongoose.model("SparePartsRequest", SparePartsRequestSchema);
