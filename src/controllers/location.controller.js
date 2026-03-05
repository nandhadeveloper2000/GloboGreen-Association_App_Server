// server/controllers/location.controller.js
const mongoose = require("mongoose");

// Helper to get native Mongo collection
const Locations = () => mongoose.connection.db.collection("locations");

/**
 * GET /api/locations/states
 * -> ["Tamil Nadu", "Puducherry", ...]
 */
const getStates = async (req, res) => {
  try {
    // Distinct states from locations
    const states = await Locations().distinct("state", {});

    return res.json({
      success: true,
      data: states.sort(),
    });
  } catch (err) {
    console.error("getStates error:", err);
    return res
      .status(500)
      .json({ success: false, message: "Failed to fetch states" });
  }
};

/**
 * GET /api/locations/districts?state=Tamil%20Nadu
 * -> ["Cuddalore", "Chennai", ...]
 */
const getDistricts = async (req, res) => {
  try {
    const { state } = req.query;

    // default to Tamil Nadu if not provided
    const stateFilter = state || "Tamil Nadu";

    const districts = await Locations().distinct("district", {
      state: stateFilter,
    });

    return res.json({
      success: true,
      data: districts.sort(),
    });
  } catch (err) {
    console.error("getDistricts error:", err);
    return res
      .status(500)
      .json({ success: false, message: "Failed to fetch districts" });
  }
};

/**
 * GET /api/locations/taluks?state=Tamil%20Nadu&district=Cuddalore
 * -> ["Kurinjipadi", "Panruti", ...]
 */
const getTaluks = async (req, res) => {
  try {
    const { state, district } = req.query;

    if (!district) {
      return res.status(400).json({
        success: false,
        message: "district query is required",
      });
    }

    const stateFilter = state || "Tamil Nadu";

    const taluks = await Locations().distinct("talukName", {
      state: stateFilter,
      district,
    });

    return res.json({
      success: true,
      data: taluks.sort(),
    });
  } catch (err) {
    console.error("getTaluks error:", err);
    return res
      .status(500)
      .json({ success: false, message: "Failed to fetch taluks" });
  }
};

/**
 * GET /api/locations/villages?state=Tamil%20Nadu&district=Cuddalore&talukName=Kurinjipadi
 * -> ["Vadavandankuppam", ...]
 */
const getVillages = async (req, res) => {
  try {
    const { state, district, talukName } = req.query;

    if (!district || !talukName) {
      return res.status(400).json({
        success: false,
        message: "district and talukName are required",
      });
    }

    const stateFilter = state || "Tamil Nadu";

    const docs = await Locations()
      .find({ state: stateFilter, district, talukName })
      .project({ villageName: 1, sno: 1, _id: 0 })
      .sort({ sno: 1 })
      .toArray();

    const villages = docs.map((v) => v.villageName);

    return res.json({
      success: true,
      data: villages,
    });
  } catch (err) {
    console.error("getVillages error:", err);
    return res
      .status(500)
      .json({ success: false, message: "Failed to fetch villages" });
  }
};

/**
 * OPTIONAL: GET /api/locations/all?state=...&district=...&talukName=...
 * Returns full rows if you ever need them.
 */
const getLocations = async (req, res) => {
  try {
    const { state, district, talukName } = req.query;

    const filter = {};
    if (state) filter.state = state;
    if (district) filter.district = district;
    if (talukName) filter.talukName = talukName;

    const rows = await Locations().find(filter).sort({ sno: 1 }).toArray();

    return res.json({
      success: true,
      count: rows.length,
      data: rows,
    });
  } catch (err) {
    console.error("getLocations error:", err);
    return res
      .status(500)
      .json({ success: false, message: "Failed to fetch locations" });
  }
};

module.exports = {
  getStates,
  getDistricts,
  getTaluks,
  getVillages,
  getLocations,
};
