// server/controllers/employee.controller.js
const bcrypt = require("bcryptjs");
const Employee = require("../models/employee.model");
const User = require("../models/user.model");

const { generateTokens, setAuthCookies } = require("../utils/generateTokens");
const { generateEmployeeQr } = require("../utils/generateOwnerQr");
const cloudinary = require("../config/cloudinary");

/**
 * POST /api/employees
 * Body: { name, mobile, pin, avatarBase64? }
 * Auth: OWNER / ADMIN
 */
const createEmployee = async (req, res) => {
  try {
    const ownerId = req.user._id;
    const { name, mobile, pin, avatarBase64 } = req.body;

    if (!name || !mobile || !pin) {
      return res.status(400).json({
        success: false,
        message: "Name, mobile and PIN are required",
      });
    }

    if (!/^\d{4,6}$/.test(String(pin))) {
      return res.status(400).json({
        success: false,
        message: "PIN must be 4–6 digits",
      });
    }

    // 🔹 Load owner (source of truth for isProfileVerified, shopCompleted)
    const owner = await User.findById(ownerId).select(
      "role shopName address isProfileVerified shopCompleted"
    );
    if (!owner) {
      return res
        .status(404)
        .json({ success: false, message: "Owner not found" });
    }

    if (!["OWNER", "ADMIN"].includes(owner.role)) {
      return res.status(403).json({
        success: false,
        message: "Only owner/admin can add employees",
      });
    }

    // Check existing active employee with same mobile for this owner
    const existing = await Employee.findOne({
      mobile,
      owner: ownerId,
      status: "Active",
    });

    if (existing) {
      return res.status(409).json({
        success: false,
        message: "Employee with this mobile already exists",
      });
    }

    const pinHash = await bcrypt.hash(String(pin), 10);

    const shopName = owner.shopName || owner.name || "";
    const shopAddress = owner.address || {};

    // 🔵 Upload avatar if provided (base64 → Cloudinary)
    let avatar = "";
    if (avatarBase64) {
      try {
        const uploadRes = await cloudinary.uploader.upload(
          `data:image/jpeg;base64,${avatarBase64}`,
          { folder: "employees/avatar" }
        );
        avatar = uploadRes.secure_url;
      } catch (e) {
        console.warn("Cloudinary upload error (employee avatar):", e);
      }
    }

    // 🔴 IMPORTANT:
    // store both `owner` and `parentOwner` pointing to the same OWNER
    let employee = await Employee.create({
      name,
      mobile,
      avatar,
      shopName,
      shopAddress,
      pinHash,
      owner: ownerId,
      parentOwner: ownerId, // 👈 ensures other logic using parentOwner works
      role: "EMPLOYEE",
      status: "Active",
    });

    // Generate employee QR
    try {
      const qrUrl = await generateEmployeeQr(employee);
      employee.qrCodeUrl = qrUrl;
      await employee.save();
    } catch (qrErr) {
      console.warn("generateEmployeeQr error:", qrErr);
    }

    return res.json({
      success: true,
      message: "Employee added successfully",
      data: {
        id: employee._id,
        name: employee.name,
        mobile: employee.mobile,
        role: employee.role,
        avatar: employee.avatar,
        shopName: employee.shopName,
        qrCodeUrl: employee.qrCodeUrl,
        status: employee.status,

        // 🔐 READ-ONLY: derived from OWNER, never updated by employee
        ownerVerified: !!owner.isProfileVerified,
        shopCompleted: !!owner.shopCompleted,
      },
    });
  } catch (err) {
    console.error("createEmployee error:", err);
    return res.status(500).json({
      success: false,
      message: "Failed to add employee",
      error: err.message,
    });
  }
};

/**
 * GET /api/employees/my
 * List employees for current owner
 */
const getMyEmployees = async (req, res) => {
  try {
    const ownerId = req.user._id;

    // 🔹 Load owner once
    const owner = await User.findById(ownerId).select(
      "isProfileVerified shopCompleted shopName"
    );

    const employees = await Employee.find({
      owner: ownerId,
    })
      .sort({ createdAt: -1 })
      .lean();

    const ownerVerified = !!owner?.isProfileVerified;
    const shopCompleted = !!owner?.shopCompleted;

    const data = employees.map((e) => ({
      id: e._id,
      name: e.name,
      mobile: e.mobile,
      role: e.role,
      avatar: e.avatar,
      shopName: e.shopName,
      qrCodeUrl: e.qrCodeUrl,
      status: e.status,

      // 🔐 For mobile UI – same for all employees of this owner
      ownerVerified,
      shopCompleted,
    }));

    return res.json({ success: true, data });
  } catch (err) {
    console.error("getMyEmployees error:", err);
    return res.status(500).json({
      success: false,
      message: "Failed to fetch employees",
      error: err.message,
    });
  }
};

/**
 * PATCH /api/employees/:id
 * Update name / mobile / pin / status (owner/admin only)
 */
const updateEmployee = async (req, res) => {
  try {
    const ownerId = req.user._id;
    const { id } = req.params;
    const { name, mobile, pin, status } = req.body;

    const employee = await Employee.findOne({
      _id: id,
      owner: ownerId,
    }).select("+pinHash");

    if (!employee) {
      return res
        .status(404)
        .json({ success: false, message: "Employee not found" });
    }

    if (name) employee.name = name;
    if (mobile) employee.mobile = mobile;

    if (typeof status === "string") {
      if (!["Active", "Inactive"].includes(status)) {
        return res.status(400).json({
          success: false,
          message: "Invalid status. Use Active or Inactive",
        });
      }
      employee.status = status;
    }

    if (pin) {
      if (!/^\d{4,6}$/.test(String(pin))) {
        return res.status(400).json({
          success: false,
          message: "PIN must be 4–6 digits",
        });
      }
      employee.pinHash = await bcrypt.hash(String(pin), 10);
    }

    await employee.save();

    // 🔹 Send back owner verification status too (for UI refresh)
    const owner = await User.findById(ownerId).select(
      "isProfileVerified shopCompleted shopName"
    );

    return res.json({
      success: true,
      message: "Employee updated successfully",
      data: {
        id: employee._id,
        name: employee.name,
        mobile: employee.mobile,
        role: employee.role,
        avatar: employee.avatar,
        shopName: employee.shopName,
        qrCodeUrl: employee.qrCodeUrl,
        status: employee.status,

        ownerVerified: !!owner?.isProfileVerified,
        shopCompleted: !!owner?.shopCompleted,
      },
    });
  } catch (err) {
    console.error("updateEmployee error:", err);
    return res.status(500).json({
      success: false,
      message: "Failed to update employee",
      error: err.message,
    });
  }
};

module.exports = {
  createEmployee,
  getMyEmployees,
  updateEmployee,
};
