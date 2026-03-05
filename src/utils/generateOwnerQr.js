// server/utils/generateOwnerQr.js
const QRCode = require("qrcode");
const cloudinary = require("../config/cloudinary");

/**
 * Upload a buffer to Cloudinary
 */
const uploadBuffer = (buffer, folder) =>
  new Promise((resolve, reject) => {
    const stream = cloudinary.uploader.upload_stream(
      {
        folder,
        resource_type: "image",
        format: "png",
      },
      (err, result) => (err ? reject(err) : resolve(result))
    );
    stream.end(buffer);
  });

/**
 * Generate QR for OWNER and upload to Cloudinary.
 * Returns Cloudinary secure_url string.
 */
const generateUserQr = async (user) => {
  if (!user) throw new Error("User required to generate QR");

  const payload = {
    t: "TNMA_OWNER",
    userId: user._id.toString(),
    name: user.name,
    mobile: user.mobile,
    shopName: user.shopName,
    regNo: user.RegistrationNumber,
    association: user.association?.toString?.() || null,
  };

  const qrBuffer = await QRCode.toBuffer(JSON.stringify(payload), {
    type: "png",
    width: 600,
    margin: 1,
    errorCorrectionLevel: "H",
  });

  const result = await uploadBuffer(qrBuffer, "users/qrCodes");
  return result.secure_url;
};

/**
 * 🔹 NEW: Generate QR for EMPLOYEE and upload to Cloudinary
 * Returns Cloudinary secure_url string.
 */
const generateEmployeeQr = async (employee, owner) => {
  if (!employee) throw new Error("Employee required to generate QR");

  const payload = {
    t: "TNMA_EMPLOYEE",
    employeeId: employee._id.toString(),
    employeeName: employee.name,
    employeeMobile: employee.mobile,
    shopName: employee.shopName || owner?.shopName || null,
    ownerId: owner?._id?.toString?.() || null,
    ownerName: owner?.name || null,
    regNo: owner?.RegistrationNumber || null,
    association: owner?.association?.toString?.() || null,
  };

  const qrBuffer = await QRCode.toBuffer(JSON.stringify(payload), {
    type: "png",
    width: 600,
    margin: 1,
    errorCorrectionLevel: "H",
  });

  const result = await uploadBuffer(qrBuffer, "employees/qrCodes");
  return result.secure_url;
};

module.exports = { generateUserQr, generateEmployeeQr };
