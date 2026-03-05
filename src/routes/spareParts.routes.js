const express = require("express");
const router = express.Router();

const ctrl = require("../controllers/spareParts.controller");
const upload = require("../middleware/upload");
const { auth, isAdmin } = require("../middleware/auth");

// my list
router.get("/my", auth, ctrl.getMySparePartsRequests);

// upload image
router.post("/upload", auth, upload.single("image"), ctrl.uploadSparePartImage);

// ✅ keep "create" endpoint name, but use upsert logic
router.post("/create", auth, ctrl.upsertSparePartsRequest);

// admin
router.get("/admin/all", auth, isAdmin, ctrl.getAllSparePartsRequests);

// fetch
router.get("/model/:modelId", auth, ctrl.getSparePartsByModelId);
router.get("/:id", auth, ctrl.getSparePartsRequestById);

// delete
router.delete("/:id", auth, ctrl.deleteSparePartsRequest);

module.exports = router;
