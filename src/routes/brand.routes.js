const brandRoutes = require("express").Router();
const upload = require("../middleware/upload"); // ✅ multer memoryStorage

const {
  addBrand,
  getBrands,
  updateBrand,
  softDeleteBrand,
  hardDeleteBrand,
} = require("../controllers/brand.controller");

brandRoutes.post("/add-brand", upload.single("image"), addBrand);
brandRoutes.get("/get-brands", getBrands);
brandRoutes.put("/update-brand", upload.single("image"), updateBrand);
brandRoutes.delete("/hard-delete-brand/:id", hardDeleteBrand);

module.exports = brandRoutes;
