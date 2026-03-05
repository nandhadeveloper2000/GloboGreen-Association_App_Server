const Kyc = require("../models/kyc.model");
const User = require("../models/user.model");
const uploadBufferToCloudinary = require("../utils/uploadToCloudinary");

// MIME types
const IMG_TYPES = ["image/jpeg", "image/jpg", "image/png"];
const PDF_TYPES = ["application/pdf"];
const ALL_TYPES = [...IMG_TYPES, ...PDF_TYPES];

function validateAny(file) {
  if (!file) return "File missing";
  if (!ALL_TYPES.includes(file.mimetype)) {
    return "Only JPG, PNG or PDF files are allowed.";
  }
  return null;
}

function validateImg(file) {
  if (!file) return "File missing";
  if (!IMG_TYPES.includes(file.mimetype)) {
    return "Only JPG/PNG images are allowed for Aadhaar photos.";
  }
  return null;
}

function validatePdf(file) {
  if (!file) return "File missing";
  if (!PDF_TYPES.includes(file.mimetype)) {
    return "Only PDF file is allowed for Aadhaar PDF upload.";
  }
  return null;
}

const getResourceType = (file) =>
  file.mimetype === "application/pdf" ? "raw" : "image";

/**
 * POST /api/kyc/upload
 * Aadhaar – MANDATORY (PDF OR front+back images)
 * GST / Udyam – OPTIONAL
 */
const uploadKycDocs = async (req, res) => {
  try {
    const ownerId = req.user._id;

    const files = req.files || {};
    const aadhaarFront = files.aadhaarFront?.[0];
    const aadhaarBack = files.aadhaarBack?.[0];
    const aadhaarPdf = files.aadhaarPdf?.[0];
    const gstCert = files.gstCert?.[0];
    const udyamCert = files.udyamCert?.[0];

    console.log("KYC upload fields:", {
      hasAFront: !!aadhaarFront,
      hasABack: !!aadhaarBack,
      hasAPdf: !!aadhaarPdf,
      hasGst: !!gstCert,
      hasUdyam: !!udyamCert,
    });

    // --- Load existing KYC first ---
    let kyc = await Kyc.findOne({ owner: ownerId });

    const hadAadhaarPdf = !!kyc?.aadhaarPdfUrl;
    const hadAadhaarImages =
      !!kyc?.aadhaarFrontUrl && !!kyc?.aadhaarBackUrl;

    // Aadhaar from this request
    const usingPdf = !!aadhaarPdf;
    const usingImages = !!aadhaarFront && !!aadhaarBack;

    // Aadhaar overall (DB + this request)
    const hasAnyAadhaar =
      usingPdf || usingImages || hadAadhaarPdf || hadAadhaarImages;

    // Aadhaar mandatory rule
    if (!hasAnyAadhaar) {
      return res.status(400).json({
        success: false,
        message:
          "Please upload either Aadhaar PDF or Aadhaar front & back images.",
      });
    }

    // ----- Validate Aadhaar only if new files are uploaded -----
    if (usingPdf) {
      const msg = validatePdf(aadhaarPdf);
      if (msg) {
        return res.status(400).json({ success: false, message: msg });
      }
      if (!aadhaarPdf.buffer) {
        return res.status(400).json({
          success: false,
          message:
            "File buffer missing for Aadhaar PDF. Ensure multer uses memoryStorage().",
        });
      }
    }

    if (usingImages) {
      const msg1 = validateImg(aadhaarFront);
      const msg2 = validateImg(aadhaarBack);
      if (msg1 || msg2) {
        return res.status(400).json({
          success: false,
          message: msg1 || msg2,
        });
      }
      if (!aadhaarFront.buffer || !aadhaarBack.buffer) {
        return res.status(400).json({
          success: false,
          message:
            "File buffer missing for Aadhaar images. Ensure multer uses memoryStorage().",
        });
      }
    }

    // ----- GST + Udyam OPTIONAL (validate only if present) -----
    for (const file of [gstCert, udyamCert].filter(Boolean)) {
      const msg = validateAny(file);
      if (msg) {
        return res.status(400).json({ success: false, message: msg });
      }
      if (!file.buffer) {
        return res.status(400).json({
          success: false,
          message:
            "File buffer missing for optional document. Ensure multer uses memoryStorage().",
        });
      }
    }

    const folder = `tnma/kyc/${ownerId.toString()}`;

    // ----- Upload Aadhaar (only newly uploaded ones) -----
    let aadhaarFrontRes = null;
    let aadhaarBackRes = null;
    let aadhaarPdfRes = null;

    if (usingPdf) {
      // PDFs must use resource_type = "raw"
      aadhaarPdfRes = await uploadBufferToCloudinary(
        aadhaarPdf.buffer,
        folder,
        "aadhaar-pdf",
        { resourceType: "raw" }
      );
    } else if (usingImages) {
      [aadhaarFrontRes, aadhaarBackRes] = await Promise.all([
        uploadBufferToCloudinary(
          aadhaarFront.buffer,
          folder,
          "aadhaar-front",
          { resourceType: "image" }
        ),
        uploadBufferToCloudinary(
          aadhaarBack.buffer,
          folder,
          "aadhaar-back",
          { resourceType: "image" }
        ),
      ]);
    }

    // ----- Upload GST / Udyam (only if present) -----
    let gstCertRes = null;
    let udyamCertRes = null;

    if (gstCert) {
      const rt = getResourceType(gstCert); // raw for PDF, image for JPG/PNG
      gstCertRes = await uploadBufferToCloudinary(
        gstCert.buffer,
        folder,
        "gst-cert",
        { resourceType: rt }
      );
    }

    if (udyamCert) {
      const rt = getResourceType(udyamCert); // raw for PDF, image for JPG/PNG
      udyamCertRes = await uploadBufferToCloudinary(
        udyamCert.buffer,
        folder,
        "udyam-cert",
        { resourceType: rt }
      );
    }

    // ----- Create / update KYC doc -----
    if (!kyc) {
      // first time KYC
      kyc = await Kyc.create({
        owner: ownerId,
        aadhaarFrontUrl: aadhaarFrontRes?.secure_url || undefined,
        aadhaarBackUrl: aadhaarBackRes?.secure_url || undefined,
        aadhaarPdfUrl: aadhaarPdfRes?.secure_url || undefined,
        gstCertUrl: gstCertRes?.secure_url,
        udyamCertUrl: udyamCertRes?.secure_url,
        status: "PENDING",
      });
    } else {
      // update only the documents that are re-uploaded
      if (aadhaarFrontRes) kyc.aadhaarFrontUrl = aadhaarFrontRes.secure_url;
      if (aadhaarBackRes) kyc.aadhaarBackUrl = aadhaarBackRes.secure_url;
      if (aadhaarPdfRes) kyc.aadhaarPdfUrl = aadhaarPdfRes.secure_url;

      if (gstCertRes) kyc.gstCertUrl = gstCertRes.secure_url;
      if (udyamCertRes) kyc.udyamCertUrl = udyamCertRes.secure_url;

      kyc.status = "PENDING";
      kyc.reviewedBy = undefined;
      kyc.reviewedAt = undefined;
      kyc.remarks = undefined;
      await kyc.save();
    }

    // sync user
    await User.findByIdAndUpdate(ownerId, {
      kycStatus: "PENDING",
      kycId: kyc._id,
    });

    return res.json({
      success: true,
      message: "KYC documents uploaded successfully.",
      data: kyc,
    });
  } catch (err) {
    console.error("KYC upload error:", err);
    return res
      .status(500)
      .json({ success: false, message: "Internal server error" });
  }
};


/**
 * GET /api/kyc/me
 * current owner's KYC
 */
const getMyKyc = async (req, res) => {
  try {
    const ownerId = req.user._id;

    const kyc = await Kyc.findOne({ owner: ownerId });

    return res.json({
      success: true,
      data: kyc || null,
    });
  } catch (err) {
    console.error("Get my KYC error:", err);
    return res
      .status(500)
      .json({ success: false, message: "Internal server error" });
  }
};

/**
 * ADMIN: GET /api/kyc/admin
 * query ?status=PENDING|APPROVED|REJECTED
 */
const adminListKyc = async (req, res) => {
  try {
    const { status } = req.query;
    const filter = {};

    if (status && ["PENDING", "APPROVED", "REJECTED"].includes(status)) {
      filter.status = status;
    }

    const list = await Kyc.find(filter)
      .populate("owner", "name email mobileNumber kycStatus")
      .populate("reviewedBy", "name email");

    return res.json({ success: true, data: list });
  } catch (err) {
    console.error("Admin list KYC error:", err);
    return res
      .status(500)
      .json({ success: false, message: "Internal server error" });
  }
};

/**
 * ADMIN: PATCH /api/kyc/admin/:kycId/review
 * body: { status: "APPROVED" | "REJECTED", remarks?: string }
 */
const adminReviewKyc = async (req, res) => {
  try {
    const adminId = req.user._id;
    const { kycId } = req.params;
    const { status, remarks } = req.body;

    if (!["APPROVED", "REJECTED"].includes(status)) {
      return res.status(400).json({
        success: false,
        message: "Invalid KYC status",
      });
    }

    const kyc = await Kyc.findById(kycId);
    if (!kyc) {
      return res.status(404).json({
        success: false,
        message: "KYC not found",
      });
    }

    // ✅ update KYC
    kyc.status = status;
    kyc.reviewedBy = adminId;
    kyc.reviewedAt = new Date();
    kyc.remarks = remarks || "";
    await kyc.save();

    // ✅ sync user
    await User.findByIdAndUpdate(kyc.owner, {
      kycStatus: status,
      kycId: kyc._id,
    });

    return res.json({
      success: true,
      message: `KYC ${status.toLowerCase()} successfully`,
      data: kyc,
    });
  } catch (err) {
    console.error("Admin review error:", err);
    return res.status(500).json({
      success: false,
      message: "Internal server error",
    });
  }
};

/**
 * ADMIN: GET /api/kyc/owner/:ownerId
 * Get one owner's KYC (for admin user detail screen)
 */
const adminGetKycByOwner = async (req, res) => {
  try {
    const { ownerId } = req.params;

    const kyc = await Kyc.findOne({ owner: ownerId })
      .populate("owner", "name email mobile mobileNumber kycStatus kycId")
      .populate("reviewedBy", "name email");

    return res.json({ success: true, data: kyc || null });
  } catch (err) {
    console.error("Admin get KYC by owner error:", err);
    return res
      .status(500)
      .json({ success: false, message: "Internal server error" });
  }
};

module.exports = {
  uploadKycDocs,
  getMyKyc,
  adminListKyc,
  adminReviewKyc,
  adminGetKycByOwner,
};
