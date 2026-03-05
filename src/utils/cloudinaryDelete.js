const cloudinary = require("cloudinary").v2;

async function deleteFromCloudinary(publicId, resourceType = "image") {
  if (!publicId) return { result: "skipped" };
  return cloudinary.uploader.destroy(publicId, { resource_type: resourceType });
}

module.exports = deleteFromCloudinary;
