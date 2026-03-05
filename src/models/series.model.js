const mongoose = require("mongoose");

const SeriesSchema = new mongoose.Schema(
  {
    brandId: { type: mongoose.Schema.Types.ObjectId, ref: "Brand", required: true, index: true },

    name: { type: String, required: true, trim: true },
    slug: { type: String, required: true, trim: true },

    status: { type: String, enum: ["Active", "Inactive"], default: "Active", index: true },
    isDeleted: { type: Boolean, default: false, index: true },
  },
  { timestamps: true }
);

// List helper
SeriesSchema.index({ isDeleted: 1, status: 1, brandId: 1, name: 1 });

// Unique per Brand (case-insensitive)
SeriesSchema.index(
  { brandId: 1, name: 1 },
  { unique: true, collation: { locale: "en", strength: 2 } }
);

SeriesSchema.index(
  { brandId: 1, slug: 1 },
  { unique: true, collation: { locale: "en", strength: 2 } }
);

module.exports = mongoose.models.Series || mongoose.model("Series", SeriesSchema);
