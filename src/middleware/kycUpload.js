const multer = require("multer");

const storage = multer.memoryStorage();

const kycUpload = multer({ storage }).fields([
  { name: "aadhaarFront", maxCount: 1 },
  { name: "aadhaarBack", maxCount: 1 },
  { name: "aadhaarPdf", maxCount: 1 },
  { name: "gstCert", maxCount: 1 },
  { name: "udyamCert", maxCount: 1 },
]);

module.exports = kycUpload;
