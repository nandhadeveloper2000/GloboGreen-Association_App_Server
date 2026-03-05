const mongoose = require('mongoose');

const BrandSchema = new mongoose.Schema(
  {
    name:   { type: String, required: true, trim: true }, // ⬅️ no unique/index here
    image:  { type: String, default: "" },
    slug:   { type: String, required: true, trim: true }, // ⬅️ no unique/index here
    status: { type: String, enum: ["Active", "Inactive"], default: "Active", index: true },
    isDeleted: { type: Boolean, default: false, index: true },
  },
  { timestamps: true }
);

// Helpful compound index for lists
BrandSchema.index({ isDeleted: 1, status: 1, name: 1 });

// Case-insensitive unique (collation)
BrandSchema.index({ name: 1 }, { unique: true, collation: { locale: "en", strength: 2 } });
BrandSchema.index({ slug: 1 }, { unique: true, collation: { locale: "en", strength: 2 } });

module.exports = mongoose.models.Brand || mongoose.model('Brand', BrandSchema);
