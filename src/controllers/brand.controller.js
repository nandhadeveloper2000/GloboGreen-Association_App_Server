const mongoose = require("mongoose");
const Brand = require("../models/brand.model");
const Model = require("../models/Model.model");
const uploadBufferToCloudinary = require("../utils/uploadToCloudinary");

const makeSlug = (val = "") =>
  String(val)
    .toLowerCase()
    .replace(/\s+/g, "-")
    .replace(/[^a-z0-9\-]/g, "")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");

// ================= CREATE =================
const addBrand = async (req, res) => {
  try {
    const name = req.body?.name;
    const status = req.body?.status || "Active";

    if (!name || !name.trim()) {
      return res.status(400).json({
        message: "Name is required",
        error: true,
        success: false,
      });
    }

    let image = "";
    let imagePublicId = "";

    // ✅ Upload to Cloudinary if file exists
    if (req.file?.buffer) {
      const upload = await uploadBufferToCloudinary(
        req.file.buffer,
        "brands",
        makeSlug(name)
      );

      image = upload.secure_url;
      imagePublicId = upload.public_id;
    }

    const doc = new Brand({
      name: name.trim(),
      status,
      slug: makeSlug(name),
      image,
      imagePublicId,
    });

    const saved = await doc.save();

    return res.status(201).json({
      message: "Brand created",
      data: saved,
      error: false,
      success: true,
    });
  } catch (err) {
    if (err?.code === 11000) {
      return res.status(409).json({
        message: "Duplicate brand name or slug",
        error: true,
        success: false,
      });
    }

    return res.status(500).json({
      message: err.message || "Server error",
      error: true,
      success: false,
    });
  }
};

// ================= LIST =================
const getBrands = async (req, res) => {
  try {
    const { q, status, page = 1, limit = 20, sort = "createdAt:asc" } = req.query;
    const [sortKey, sortDir] = String(sort).split(":");

    const query = {};
    if (status) query.status = status;
    if (q && String(q).trim()) {
      query.name = { $regex: String(q).trim(), $options: "i" };
    }

    const skip = (Number(page) - 1) * Number(limit);

    const [items, total] = await Promise.all([
      Brand.find(query)
        .collation({ locale: "en", strength: 2 })
        .sort({ [sortKey]: sortDir === "asc" ? 1 : -1 })
        .skip(skip)
        .limit(Number(limit))
        .lean(),
      Brand.countDocuments(query),
    ]);

    return res.status(200).json({
      message: "Brands fetched",
      data: items,
      pagination: {
        page: Number(page),
        limit: Number(limit),
        total,
        pages: Math.ceil(total / Number(limit)),
      },
      error: false,
      success: true,
    });
  } catch (err) {
    return res.status(500).json({
      message: err.message || "Server error",
      error: true,
      success: false,
    });
  }
};

// ================= UPDATE =================
const updateBrand = async (req, res) => {
  try {
    const _id = req.body?._id;
    const name = req.body?.name;
    const status = req.body?.status;

    if (!_id || !mongoose.isValidObjectId(_id)) {
      return res.status(400).json({
        message: "Valid _id is required",
        error: true,
        success: false,
      });
    }

    const update = {};

    if (typeof name === "string") {
      update.name = name.trim();
      update.slug = makeSlug(name.trim());
    }

    if (typeof status === "string") {
      update.status = status;
    }

    // ✅ New image uploaded → Cloudinary
    if (req.file?.buffer) {
      const upload = await uploadBufferToCloudinary(
        req.file.buffer,
        "brands",
        makeSlug(name || "brand")
      );

      update.image = upload.secure_url;
      update.imagePublicId = upload.public_id;
    }

    const updated = await Brand.findByIdAndUpdate(
      _id,
      { $set: update },
      { new: true, runValidators: true }
    );

    if (!updated) {
      return res.status(404).json({
        message: "Brand not found",
        error: true,
        success: false,
      });
    }

    return res.status(200).json({
      message: "Brand updated",
      data: updated,
      error: false,
      success: true,
    });
  } catch (err) {
    if (err?.code === 11000) {
      return res.status(409).json({
        message: "Duplicate brand name or slug",
        error: true,
        success: false,
      });
    }

    return res.status(500).json({
      message: err.message || "Server error",
      error: true,
      success: false,
    });
  }
};

// ================= HARD DELETE =================
const hardDeleteBrand = async (req, res) => {
  try {
    const { id } = req.params;

    if (!id || !mongoose.isValidObjectId(id)) {
      return res.status(400).json({
        message: "Valid id is required",
        error: true,
        success: false,
      });
    }

    const modelCount = await Model.countDocuments({ brandId: id });
    if (modelCount > 0) {
      return res.status(400).json({
        message: "Brand is in use; can't hard delete.",
        error: true,
        success: false,
      });
    }

    const result = await Brand.deleteOne({ _id: id });
    if (result.deletedCount === 0) {
      return res.status(404).json({
        message: "Brand not found",
        error: true,
        success: false,
      });
    }

    return res.status(200).json({
      message: "Brand deleted permanently",
      error: false,
      success: true,
    });
  } catch (err) {
    return res.status(500).json({
      message: err.message || "Server error",
      error: true,
      success: false,
    });
  }
};

module.exports = {
  addBrand,
  getBrands,
  updateBrand,
  hardDeleteBrand,
};
