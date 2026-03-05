// server/routes/qr.routes.js
const express = require("express");
const router = express.Router();

const { auth } = require("../middleware/auth");
const { scanQr, getMyQr, getScanHistory } = require("../controllers/qr.controller");

router.post("/scan", auth, scanQr);      // Scan QR (OWNER or EMPLOYEE)
router.get("/my", auth, getMyQr);        // Get logged-in user's QR
router.get("/history", auth, getScanHistory);   // Get scan history

module.exports = router;
