const express = require("express");
const { adminStats } = require("../controllers/admin.controller");
const { auth, isAdmin } = require("../middleware/auth"); 

const router = express.Router();

router.get("/stats", auth, isAdmin, adminStats);

module.exports = router;
