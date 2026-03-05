// server/routes/location.routes.js
const express = require("express");
const router = express.Router();

const {
  getStates,
  getDistricts,
  getTaluks,
  getVillages,
  getLocations,
} = require("../controllers/location.controller");

router.get("/all", getLocations);
router.get("/states", getStates);
router.get("/districts", getDistricts);
router.get("/taluks", getTaluks);
router.get("/villages", getVillages);

module.exports = router;
