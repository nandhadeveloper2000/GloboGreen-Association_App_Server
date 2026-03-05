const mongoose = require("mongoose");
const SparePartsRequest = require("../models/spareParts.model");
const User = require("../models/user.model");
const uploadBufferToCloudinary = require("../utils/uploadToCloudinary");

/**
 * POST /api/spareparts/upload
 * form-data: image(file), modelId, partKey
 * ✅ returns only imageUrl
 */
const uploadSparePartImage = async (req, res) => {
  try {
    const { modelId: rawModelId, partKey } = req.body;

    const modelId =
      typeof rawModelId === "string"
        ? rawModelId
        : rawModelId?._id
        ? String(rawModelId._id)
        : "";

    if (!modelId || !mongoose.Types.ObjectId.isValid(modelId)) {
      return res.status(400).json({ success: false, message: "Invalid modelId" });
    }

    if (!partKey) {
      return res.status(400).json({ success: false, message: "partKey required" });
    }

    if (!req.file) {
      return res.status(400).json({ success: false, message: "image file missing" });
    }

    const file = req.file;
    const allowed = ["image/jpeg", "image/jpg", "image/png", "image/webp"];
    if (!allowed.includes(file.mimetype)) {
      return res.status(400).json({
        success: false,
        message: "Only JPG/PNG/WEBP allowed",
      });
    }

    // ✅ folder safe
    const folder = `spareparts/${modelId}`;

    const uploaded = await uploadBufferToCloudinary(file.buffer, {
      folder,
      resource_type: "image",
    });

    return res.json({
      success: true,
      data: {
        modelId,
        partKey,
        imageUrl: uploaded.secure_url || uploaded.url || "",
      },
    });
  } catch (err) {
    console.log("❌ uploadSparePartImage:", err);
    return res.status(500).json({ success: false, message: "Server error" });
  }
};

/**
 * POST /api/spareparts/create
 * body: { modelId, items[] }
 */
const upsertSparePartsRequest = async (req, res) => {
  try {
    const { modelId, items } = req.body;
    const ownerId = req.user?._id;

    if (!ownerId) {
      return res.status(401).json({ success: false, message: "Unauthorized" });
    }

    if (!mongoose.Types.ObjectId.isValid(String(modelId))) {
      return res.status(400).json({ success: false, message: "Invalid modelId" });
    }

    if (!Array.isArray(items)) {
      return res.status(400).json({ success: false, message: "items array required" });
    }

    const owner = await User.findById(ownerId).select(
      "_id name shopName RegistrationNumber role status"
    );

    if (!owner || owner.status !== "Active") {
      return res.status(401).json({ success: false, message: "Unauthorized" });
    }

    if (owner.role !== "OWNER" && owner.role !== "ADMIN") {
      return res.status(403).json({ success: false, message: "Owner only" });
    }

    // ✅ normalize incoming items
    const incoming = items.map((x) => ({
      partKey: String(x.partKey),
      title: String(x.title || ""),
      description: String(x.description || ""),
      imageUrl: String(x.imageUrl || ""),
    }));

    let doc = await SparePartsRequest.findOne({
      ownerId,
      modelId,
      status: "SUBMITTED",
    });

    // 🆕 CREATE
    if (!doc) {
      doc = await SparePartsRequest.create({
        ownerId,
        modelId,
        ownerShopName: owner.shopName || "",
        ownerName: owner.name || "",
        ownerRegistrationNumber: owner.RegistrationNumber || "",
        items: incoming,
        status: "SUBMITTED",
      });

      return res.json({ success: true, data: doc, mode: "created" });
    }

    // 🔁 MERGE BY partKey
    const map = new Map();
    for (const it of doc.items) map.set(it.partKey, it);

    for (const it of incoming) {
      const old = map.get(it.partKey);
      map.set(it.partKey, {
        partKey: it.partKey,
        title: it.title || old?.title || "",
        description: it.description || old?.description || "",
        imageUrl: it.imageUrl || old?.imageUrl || "",
      });
    }

    doc.items = Array.from(map.values());
    doc.ownerShopName = owner.shopName || doc.ownerShopName;
    doc.ownerName = owner.name || doc.ownerName;
    doc.ownerRegistrationNumber =
      owner.RegistrationNumber || doc.ownerRegistrationNumber;

    await doc.save();

    return res.json({ success: true, data: doc, mode: "updated" });
  } catch (err) {
    console.log("❌ upsertSparePartsRequest:", err);

    // duplicate key safety
    if (err?.code === 11000) {
      const doc = await SparePartsRequest.findOne({
        ownerId: req.user._id,
        modelId: req.body.modelId,
        status: "SUBMITTED",
      });
      return res.json({ success: true, data: doc, mode: "updated" });
    }

    return res.status(500).json({ success: false, message: "Server error" });
  }
};

/**
 * GET /api/spareparts/my
 */
const getMySparePartsRequests = async (req, res) => {
  try {
    const ownerId = req.user?._id;
    if (!ownerId) {
      return res.status(401).json({ success: false, message: "Unauthorized" });
    }

    const list = await SparePartsRequest.find({ ownerId })
      .populate("modelId", "name imageUrl")
      .sort({ createdAt: -1 });

    return res.json({ success: true, data: list });
  } catch (err) {
    console.log("❌ getMySparePartsRequests:", err);
    return res.status(500).json({ success: false, message: "Server error" });
  }
};

/**
 * GET /api/spareparts/admin/all
 */
const getAllSparePartsRequests = async (req, res) => {
  try {
    const page = Math.max(parseInt(req.query.page || "1", 10), 1);
    const limit = Math.min(Math.max(parseInt(req.query.limit || "20", 10), 1), 100);
    const skip = (page - 1) * limit;

    const filter = {};
    const modelId = String(req.query.modelId || "");
    if (modelId && mongoose.Types.ObjectId.isValid(modelId)) {
      filter.modelId = modelId;
    }

    const [items, total] = await Promise.all([
      SparePartsRequest.find(filter)
        .populate("modelId", "name imageUrl")
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit),
      SparePartsRequest.countDocuments(filter),
    ]);

    return res.json({
      success: true,
      data: {
        items,
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    });
  } catch (err) {
    console.log("❌ getAllSparePartsRequests:", err);
    return res.status(500).json({ success: false, message: "Server error" });
  }
};

/**
 * GET /api/spareparts/:id
 */
const getSparePartsRequestById = async (req, res) => {
  try {
    const { id } = req.params;

    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({ success: false, message: "Invalid id" });
    }

    const doc = await SparePartsRequest.findById(id).populate(
      "modelId",
      "name imageUrl"
    );

    if (!doc) {
      return res.status(404).json({ success: false, message: "Not found" });
    }

    return res.json({ success: true, data: doc });
  } catch (err) {
    console.log("❌ getSparePartsRequestById:", err);
    return res.status(500).json({ success: false, message: "Server error" });
  }
};

/**
 * GET /api/spareparts/model/:modelId
 */
const getSparePartsByModelId = async (req, res) => {
  try {
    const { modelId } = req.params;

    if (!mongoose.Types.ObjectId.isValid(modelId)) {
      return res.status(400).json({ success: false, message: "Invalid modelId" });
    }

    const list = await SparePartsRequest.find({ modelId })
      .populate("modelId", "name imageUrl")
      .sort({ createdAt: -1 });

    return res.json({ success: true, data: list });
  } catch (err) {
    console.log("❌ getSparePartsByModelId:", err);
    return res.status(500).json({ success: false, message: "Server error" });
  }
};

/**
 * DELETE /api/spareparts/:id
 * ✅ deletes only Mongo doc (no cloudinary delete)
 */
const deleteSparePartsRequest = async (req, res) => {
  try {
    const { id } = req.params;

    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({ success: false, message: "Invalid id" });
    }

    const doc = await SparePartsRequest.findById(id);
    if (!doc) {
      return res.status(404).json({ success: false, message: "Not found" });
    }

    await SparePartsRequest.deleteOne({ _id: id });

    return res.json({
      success: true,
      message: "Deleted successfully",
      data: { deletedId: id },
    });
  } catch (err) {
    console.log("❌ deleteSparePartsRequest:", err);
    return res.status(500).json({ success: false, message: "Server error" });
  }
};

module.exports = {
  uploadSparePartImage,
  upsertSparePartsRequest,
  getMySparePartsRequests,
  getAllSparePartsRequests,
  getSparePartsRequestById,
  getSparePartsByModelId,
  deleteSparePartsRequest,
};
