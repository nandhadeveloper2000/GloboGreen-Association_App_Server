const modelRoutes = require("express").Router();
const upload = require("../middleware/upload"); // multer memoryStorage

const {
  addModel,
  getModels,
  updateModel,
  hardDeleteModel,
} = require("../controllers/model.controller");

modelRoutes.post("/add-model", upload.single("image"), addModel);
modelRoutes.put("/update-model", upload.single("image"), updateModel);
modelRoutes.get("/get-models", getModels); 
modelRoutes.delete("/hard-delete-model/:id", hardDeleteModel);

module.exports = modelRoutes;
