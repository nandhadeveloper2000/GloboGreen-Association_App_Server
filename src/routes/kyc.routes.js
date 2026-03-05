// routes/kyc.routes.js
const express = require("express");
const router = express.Router();

const { auth } = require("../middleware/auth");
const multer = require("multer");

const upload = multer({ storage: multer.memoryStorage() });
const {
  uploadKycDocs,
  getMyKyc,
  adminListKyc,
  adminReviewKyc,
  adminGetKycByOwner,
} = require("../controllers/kyc.controller");

// your own isAdmin middleware
const isAdmin = (req, res, next) => {
  if (req.user && req.user.role === "ADMIN") return next();
  return res.status(403).json({ success: false, message: "Forbidden" });
};

// Upload middleware: Aadhaar can be (front+back) OR pdf
const kycUpload = upload.fields([
  { name: "aadhaarFront", maxCount: 1 },
  { name: "aadhaarBack", maxCount: 1 },
  { name: "aadhaarPdf", maxCount: 1 },  
  { name: "gstCert", maxCount: 1 },
  { name: "udyamCert", maxCount: 1 },
]);

// OWNER routes
router.get("/me", auth, getMyKyc);
router.post("/upload", auth, kycUpload, uploadKycDocs);

// ADMIN routes
router.get("/admin", auth, isAdmin, adminListKyc);
router.patch("/admin/:kycId/review", auth, isAdmin, adminReviewKyc);
router.get("/owner/:ownerId", auth, isAdmin,adminGetKycByOwner);

module.exports = router;
