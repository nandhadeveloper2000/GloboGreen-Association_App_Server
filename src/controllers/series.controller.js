const mongoose = require("mongoose");
const Series = require("../models/series.model");
const Model = require("../models/Model.model");

const makeSlug = (val = "") =>
  String(val)
    .toLowerCase()
    .replace(/\s+/g, "-")
    .replace(/[^a-z0-9\-]/g, "")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");

// CREATE
const addSeries = async (req, res) => {
  try {
    const { brandId, name, status = "Active" } = req.body;

    if (!brandId || !mongoose.isValidObjectId(brandId)) {
      return res.status(400).json({ message: "Valid brandId is required", error: true, success: false });
    }
    if (!name || !String(name).trim()) {
      return res.status(400).json({ message: "Name is required", error: true, success: false });
    }

    const doc = new Series({
      brandId,
      name: String(name).trim(),
      status,
      slug: makeSlug(name),
    });

    const saved = await doc.save();
    return res.status(201).json({ message: "Series created", data: saved, error: false, success: true });
  } catch (err) {
    if (err?.code === 11000) {
      return res.status(409).json({ message: "Duplicate series name or slug for this brand", error: true, success: false });
    }
    return res.status(500).json({ message: err.message || "Server error", error: true, success: false });
  }
};

// LIST
const getSeries = async (req, res) => {
  try {
    const { brandId, q, status, page = 1, limit = 20, sort = "createdAt:asc" } = req.query;
    const [sortKey, sortDir] = String(sort).split(":");

    const query = { isDeleted: false };
    if (brandId) query.brandId = brandId;
    if (status) query.status = status;
    if (q && String(q).trim()) query.name = { $regex: String(q).trim(), $options: "i" };

    const skip = (Number(page) - 1) * Number(limit);

    const [items, total] = await Promise.all([
      Series.find(query)
        .collation({ locale: "en", strength: 2 })
        .sort({ [sortKey]: sortDir === "asc" ? 1 : -1 })
        .skip(skip)
        .limit(Number(limit))
        .lean(),
      Series.countDocuments(query),
    ]);

    return res.status(200).json({
      message: "Series fetched",
      data: items,
      pagination: { page: Number(page), limit: Number(limit), total, pages: Math.ceil(total / Number(limit)) },
      error: false,
      success: true,
    });
  } catch (err) {
    return res.status(500).json({ message: err.message || "Server error", error: true, success: false });
  }
};

// UPDATE
const updateSeries = async (req, res) => {
  try {
    const { _id, name, status } = req.body;

    if (!_id || !mongoose.isValidObjectId(_id)) {
      return res.status(400).json({ message: "Valid _id is required", error: true, success: false });
    }

    const update = {};
    if (typeof name === "string") {
      update.name = name.trim();
      update.slug = makeSlug(name.trim());
    }
    if (typeof status === "string") update.status = status;

    const updated = await Series.findByIdAndUpdate(
      _id,
      { $set: update },
      { new: true, runValidators: true, collation: { locale: "en", strength: 2 } }
    );

    if (!updated) return res.status(404).json({ message: "Series not found", error: true, success: false });

    return res.status(200).json({ message: "Series updated", data: updated, error: false, success: true });
  } catch (err) {
    if (err?.code === 11000) {
      return res.status(409).json({ message: "Duplicate series name or slug for this brand", error: true, success: false });
    }
    return res.status(500).json({ message: err.message || "Server error", error: true, success: false });
  }
};

// HARD DELETE (block if models exist)
const hardDeleteSeries = async (req, res) => {
  try {
    const { id } = req.params;
    if (!id || !mongoose.isValidObjectId(id)) {
      return res.status(400).json({ message: "Valid id is required", error: true, success: false });
    }

    const modelCount = await Model.countDocuments({ seriesId: id });
    if (modelCount > 0) {
      return res.status(400).json({ message: "Series is in use; can't hard delete.", error: true, success: false });
    }

    const result = await Series.deleteOne({ _id: id });
    if (result.deletedCount === 0) {
      return res.status(404).json({ message: "Series not found", error: true, success: false });
    }

    return res.status(200).json({ message: "Series deleted permanently", error: false, success: true });
  } catch (err) {
    return res.status(500).json({ message: err.message || "Server error", error: true, success: false });
  }
};

module.exports = { addSeries, getSeries, updateSeries, hardDeleteSeries };
