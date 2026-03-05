const mongoose = require("mongoose");

const PhoneModelSchema = new mongoose.Schema(
  {
    brandId: { type: mongoose.Schema.Types.ObjectId, ref: "Brand", required: true, index: true },
    seriesId: { type: mongoose.Schema.Types.ObjectId, ref: "Series", required: true, index: true },

    name: { type: String, required: true, trim: true },
    slug: { type: String, required: true, trim: true },

    // ✅ Model image (Cloudinary URL)
    imageUrl: { type: String, default: "" },

    // ✅ optional but recommended for later delete/update in Cloudinary
    imagePublicId: { type: String, default: "" },

    status: { type: String, enum: ["Active", "Inactive"], default: "Active", index: true },
    isDeleted: { type: Boolean, default: false, index: true },
  },
  { timestamps: true }
);

PhoneModelSchema.index({ isDeleted: 1, status: 1, brandId: 1, seriesId: 1, name: 1 });

// Unique per Series (case-insensitive)
PhoneModelSchema.index(
  { seriesId: 1, name: 1 },
  { unique: true, collation: { locale: "en", strength: 2 } }
);

PhoneModelSchema.index(
  { seriesId: 1, slug: 1 },
  { unique: true, collation: { locale: "en", strength: 2 } }
);

module.exports = mongoose.models.Model || mongoose.model("Model", PhoneModelSchema);
