// server/models/scanHistory.model.js
const mongoose = require("mongoose");
const { Schema } = mongoose;

const scanHistorySchema = new Schema(
  {
    // 🧍‍♂️ Who scanned (current logged-in user: OWNER / EMPLOYEE / USER)
    fromUser: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },

    // 🧍‍♂️ Whose QR was scanned (main opposite user, usually OWNER)
    toUser: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },

    // Role snapshot at the time of scan (scanner side + target side)
    fromRole: {
      type: String,
      enum: ["OWNER", "EMPLOYEE", "USER", "ADMIN", "UNKNOWN"],
      default: "UNKNOWN",
    },
    toRole: {
      type: String,
      enum: ["OWNER", "EMPLOYEE", "USER", "ADMIN", "UNKNOWN"],
      default: "UNKNOWN",
    },

    // 🏬 Owner IDs for shop-level history
    // scannerOwner = OWNER id of the scanner’s shop
    scannerOwner: {
      type: Schema.Types.ObjectId,
      ref: "User",
      default: null,
    },

    // targetOwner = OWNER id of the QR owner’s shop
    targetOwner: {
      type: Schema.Types.ObjectId,
      ref: "User",
      default: null,
    },

    // Snapshot of both sides at scan time
    fromName: { type: String, required: true }, // scanner name
    toName: { type: String, required: true },   // opposite party name

    fromShopName: { type: String, default: "" }, // scanner shop name
    toShopName: { type: String, default: "" },   // opposite shop name

    // BUY / RETURN (or UNKNOWN)
    actionType: {
      type: String,
      enum: ["BUY", "RETURN", "UNKNOWN"],
      default: "UNKNOWN",
    },

    // Notes from QR scan screen
    notes: {
      type: String,
      default: "",
    },
  },
  {
    timestamps: true, // createdAt = scan date/time
  }
);

module.exports = mongoose.model("ScanHistory", scanHistorySchema);
