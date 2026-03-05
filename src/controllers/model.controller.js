const mongoose = require("mongoose");
const Brand = require("../models/brand.model");
const Series = require("../models/series.model");
const Model = require("../models/Model.model");
const uploadBufferToCloudinary = require("../utils/uploadToCloudinary");
const cloudinary = require("../config/cloudinary");

const makeSlug = (val = "") =>
  String(val)
    .toLowerCase()
    .replace(/\s+/g, "-")
    .replace(/[^a-z0-9\-]/g, "")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");

/* ================= CREATE ================= */
const addModel = async (req, res) => {
  try {
    const brandId = req.body?.brandId;
    const seriesId = req.body?.seriesId;
    const name = req.body?.name;
    const status = req.body?.status || "Active";

    if (!brandId || !mongoose.isValidObjectId(brandId)) {
      return res.status(400).json({ message: "Valid brandId is required", error: true, success: false });
    }
    if (!seriesId || !mongoose.isValidObjectId(seriesId)) {
      return res.status(400).json({ message: "Valid seriesId is required", error: true, success: false });
    }
    if (!name || !String(name).trim()) {
      return res.status(400).json({ message: "Name is required", error: true, success: false });
    }

    const [brand, series] = await Promise.all([
      Brand.findById(brandId).lean(),
      Series.findById(seriesId).lean(),
    ]);

    if (!brand) return res.status(404).json({ message: "Brand not found", error: true, success: false });
    if (!series) return res.status(404).json({ message: "Series not found", error: true, success: false });

    let imageUrl = "";
    let imagePublicId = "";

    // ✅ upload file to cloudinary
    if (req.file?.buffer) {
      const upload = await uploadBufferToCloudinary(
        req.file.buffer,
        "models",
        makeSlug(name)
      );
      imageUrl = upload.secure_url;
      imagePublicId = upload.public_id;
    }

    const doc = new Model({
      brandId,
      seriesId,
      name: String(name).trim(),
      slug: makeSlug(name),
      imageUrl,
      imagePublicId,
      status,
    });

    const saved = await doc.save();
    return res.status(201).json({ message: "Model created", data: saved, error: false, success: true });
  } catch (err) {
    if (err?.code === 11000) {
      return res.status(409).json({ message: "Duplicate model name or slug for this series", error: true, success: false });
    }
    return res.status(500).json({ message: err.message || "Server error", error: true, success: false });
  }
};

/* ================= LIST (keep yours) ================= */
const getModels = async (req, res) => {
  try {
    const { brandId, seriesId, q, status, page = 1, limit = 20, sort = "createdAt:asc" } = req.query;
    const [sortKey, sortDir] = String(sort).split(":");

    const query = { isDeleted: false };
    if (brandId) query.brandId = brandId;
    if (seriesId) query.seriesId = seriesId;
    if (status) query.status = status;
    if (q && String(q).trim()) query.name = { $regex: String(q).trim(), $options: "i" };

    const skip = (Number(page) - 1) * Number(limit);

    const [items, total] = await Promise.all([
      Model.find(query)
        .collation({ locale: "en", strength: 2 })
        .sort({ [sortKey]: sortDir === "asc" ? 1 : -1 })
        .skip(skip)
        .limit(Number(limit))
        .lean(),
      Model.countDocuments(query),
    ]);

    return res.status(200).json({
      message: "Models fetched",
      data: items,
      pagination: { page: Number(page), limit: Number(limit), total, pages: Math.ceil(total / Number(limit)) },
      error: false,
      success: true,
    });
  } catch (err) {
    return res.status(500).json({ message: err.message || "Server error", error: true, success: false });
  }
};

/* ================= UPDATE ================= */
const updateModel = async (req, res) => {
  try {
    const _id = req.body?._id;
    const name = req.body?.name;
    const status = req.body?.status;

    if (!_id || !mongoose.isValidObjectId(_id)) {
      return res.status(400).json({ message: "Valid _id is required", error: true, success: false });
    }

    const existing = await Model.findById(_id).lean();
    if (!existing) return res.status(404).json({ message: "Model not found", error: true, success: false });

    const update = {};
    if (typeof name === "string" && name.trim()) {
      update.name = name.trim();
      update.slug = makeSlug(name.trim());
    }
    if (typeof status === "string") update.status = status;

    // ✅ if new file uploaded → replace cloudinary image
    if (req.file?.buffer) {
      // delete old image if exists
      if (existing.imagePublicId) {
        await cloudinary.uploader.destroy(existing.imagePublicId, { resource_type: "image" }).catch(() => {});
      }

      const upload = await uploadBufferToCloudinary(
        req.file.buffer,
        "models",
        makeSlug(name || existing.name)
      );

      update.imageUrl = upload.secure_url;
      update.imagePublicId = upload.public_id;
    }

    const updated = await Model.findByIdAndUpdate(
      _id,
      { $set: update },
      { new: true, runValidators: true, collation: { locale: "en", strength: 2 } }
    );

    return res.status(200).json({ message: "Model updated", data: updated, error: false, success: true });
  } catch (err) {
    if (err?.code === 11000) {
      return res.status(409).json({ message: "Duplicate model name or slug for this series", error: true, success: false });
    }
    return res.status(500).json({ message: err.message || "Server error", error: true, success: false });
  }
};

/* ================= DELETE (with cloudinary cleanup) ================= */
const hardDeleteModel = async (req, res) => {
  try {
    const { id } = req.params;
    if (!id || !mongoose.isValidObjectId(id)) {
      return res.status(400).json({ message: "Valid id is required", error: true, success: false });
    }

    const doc = await Model.findById(id).lean();
    if (!doc) return res.status(404).json({ message: "Model not found", error: true, success: false });

    if (doc.imagePublicId) {
      await cloudinary.uploader.destroy(doc.imagePublicId, { resource_type: "image" }).catch(() => {});
    }

    await Model.deleteOne({ _id: id });

    return res.status(200).json({ message: "Model deleted permanently", error: false, success: true });
  } catch (err) {
    return res.status(500).json({ message: err.message || "Server error", error: true, success: false });
  }
};

module.exports = { addModel, getModels, updateModel, hardDeleteModel };
