/*****************************************************
 * AUTH CONTROLLER (Login, Signup, OTP, Google, Tokens)
 *****************************************************/
const bcrypt = require("bcryptjs");
const { OAuth2Client } = require("google-auth-library");
const User = require("../models/user.model");
const Otp = require("../models/otp.model");
const Employee = require("../models/employee.model");
const { computeProfilePercent } = require("../utils/profileScore");

const {
  generateTokens,
  setAuthCookies,
  clearAuthCookies,
  generateTokensFromPayload,
} = require("../utils/generateTokens");

const {
  sendMail,
  verifyEmailOtpTemplate,
  forgotPasswordOtpTemplate,
} = require("../utils/sendMail");

// 🔹 NEW: Cloudinary QR generator
const { generateUserQr, generateEmployeeQr } = require("../utils/generateOwnerQr");

const OTP_EXP_MINUTES = 10;
const client = new OAuth2Client(process.env.GOOGLE_CLIENT_ID);

/* ---------- Helper: Shop Completed Check (only shop fields) ---------- */
const hasCompletedShop = (u) => {
  if (!u) return false;

  const sa = u.shopAddress || {};
  const loc = u.shopLocation || {};

  const hasAddress =
    !!sa.street &&
    !!sa.city &&
    !!sa.district &&
    !!sa.state &&
    !!sa.pincode;

  const hasLocation =
    loc &&
    Array.isArray(loc.coordinates) &&
    loc.coordinates.length === 2 &&
    typeof loc.coordinates[0] === "number" &&
    typeof loc.coordinates[1] === "number";

  return (
    !!u.shopName &&
    !!u.BusinessType &&
    !!u.BusinessCategory &&
    hasAddress &&
    hasLocation
  );
};

/* ---------- Helper: OTP Create ---------- */
const createOtp = async ({ email, code, purpose }) => {
  const expiresAt = new Date(Date.now() + OTP_EXP_MINUTES * 60 * 1000);

  // Invalidate any previous active OTPs of same purpose
  await Otp.updateMany(
    { email, purpose, isUsed: false, expiresAt: { $gt: new Date() } },
    { $set: { isUsed: true } }
  );

  await Otp.create({ email, code, purpose, expiresAt });
};

/* ---------- Helper: Google Admin Whitelist ---------- */
const markAdminIfWhitelisted = (user) => {
  const g1 = process.env.GOOGLE_EMAIL_ID_1;
  const g2 = process.env.GOOGLE_EMAIL_ID_2;

  if (user.provider === "google" && (user.email === g1 || user.email === g2)) {
    user.role = "ADMIN";
  }
};

/* =====================================================
   REGISTER (EMAIL + PASSWORD)
===================================================== */
const register = async (req, res) => {
  try {
    const {
      name,
      email,
      password,
      mobile,
      BusinessType,
      BusinessCategory,
      associationId,
      shopName,
    } = req.body;

    if (!name || !email || !password) {
      return res.status(400).json({
        success: false,
        message: "Name, email & password required",
      });
    }

    const existing = await User.findOne({ email });
    if (existing) {
      return res.status(409).json({
        success: false,
        message: "Email already registered",
      });
    }

    const hash = await bcrypt.hash(password, 10);

    await User.create({
      name,
      email,
      password: hash,
      mobile,
      provider: "local",
      BusinessType,
      BusinessCategory,
      association: associationId || null,
      shopName,
    });

    let otpError = null;

    try {
      const code = String(Math.floor(100000 + Math.random() * 900000));
      await createOtp({ email, code, purpose: "verify_email" });

      await sendMail({
        to: email,
        subject: "Verify your email",
        html: verifyEmailOtpTemplate(name || "Member", code),
      });
    } catch (err) {
      console.error("❌ OTP / Email error in register:", err);
      otpError = err;
    }

    return res.json({
      success: true,
      message: otpError
        ? "Registered successfully, but failed to send OTP email. Please contact admin."
        : "Registered successfully. OTP sent to email.",
    });
  } catch (err) {
    console.error("❌ Register error:", err);

    let message = "Register failed";

    if (err.code === 11000 && err.keyPattern && err.keyPattern.email) {
      message = "Email already registered";
    }
    if (
      err.code === 11000 &&
      err.keyPattern &&
      err.keyPattern.RegistrationNumber
    ) {
      message = "Registration number already exists. Please try again.";
    }

    return res.status(500).json({
      success: false,
      message,
      error: err.message,
    });
  }
};

/* =====================================================
 *  MERGED LOGIN
 *  - Member login:   (email OR mobile) + password
 *  - Employee login: mobile + pin
 * ==================================================== */
const login = async (req, res) => {
  try {
    const { email, password, mobile, pin } = req.body;

    /* ----------------------------------------------
     * BRANCH 1: MEMBER LOGIN (email/mobile + password)
     * ---------------------------------------------- */
    if (password && (email || mobile)) {
      console.log("🔐 MEMBER LOGIN start:", email || mobile);

      // Decide whether to search by email or mobile
      const query = email ? { email } : { mobile };

      const user = await User.findOne(query).select("+password");
      if (!user) {
        return res.status(401).json({
          success: false,
          message: "Invalid email/mobile or password",
        });
      }

      if (!user.password) {
        return res.status(400).json({
          success: false,
          message: "This account uses Google login. Use Google login.",
        });
      }

      const match = await bcrypt.compare(password, user.password);
      if (!match) {
        return res.status(401).json({
          success: false,
          message: "Invalid email/mobile or password",
        });
      }

      /* 🔐 NEW: block login if email not verified */
      if (!user.verify_email) {
        try {
          const code = String(Math.floor(100000 + Math.random() * 900000));
          await createOtp({
            email: user.email,
            code,
            purpose: "verify_email",
          });

          await sendMail({
            to: user.email,
            subject: "Verify your email",
            html: verifyEmailOtpTemplate(user.name || "Member", code),
          });
        } catch (mailErr) {
          console.error("verify_email login OTP error:", mailErr);
        }

        return res.status(403).json({
          success: false,
          requiresEmailVerification: true,
          message:
            "Your email is not verified. We have sent an OTP to your email. Please verify to continue.",
          email: user.email,
        });
      }

      /* ✅ Only if verified → continue normal login */
      const { accessToken, refreshToken } = generateTokens(user);

      user.refresh_token = refreshToken;
      user.last_login_date = new Date();

      // ✅ Generate / migrate QR:
      if (!user.qrCodeUrl || String(user.qrCodeUrl).startsWith("data:image")) {
        try {
          const qrUrl = await generateUserQr(user); // Cloudinary URL
          user.qrCodeUrl = qrUrl;
        } catch (qrErr) {
          console.error("⚠️ QR generate error (member login):", qrErr.message);
        }
      }

      try {
        const profile = computeProfilePercent(user);
        user.profilePercent = profile.total;
        user.profileBreakdown = profile;
        user.shopCompleted = hasCompletedShop(user);
      } catch (ppErr) {
        console.error("⚠️ profilePercent error (member login):", ppErr.message);
        user.profilePercent = user.profilePercent || 0;
        user.profileBreakdown = user.profileBreakdown || null;
        user.shopCompleted = user.shopCompleted || false;
      }

      await user.save();

      setAuthCookies(res, { accessToken, refreshToken });

      console.log("✅ MEMBER LOGIN success:", user._id.toString());

      return res.json({
        success: true,
        message: "Login successful",
        loginType: "MEMBER",
        accessToken,
        user: {
          id: user._id,
          name: user.name,
          email: user.email,
          mobile: user.mobile,
          role: user.role,
          avatar: user.avatar || "",
          qrCodeUrl: user.qrCodeUrl || "",
          isProfileVerified: user.isProfileVerified || false,
          profilePercent: user.profilePercent || 0,
          shopCompleted: !!user.shopCompleted,
          BusinessType: user.BusinessType || "",
          BusinessCategory: user.BusinessCategory || "",
          shopName: user.shopName || "",
          shopAddress: user.shopAddress || null,
          shopFront: user.shopFront || "",
          shopBanner: user.shopBanner || "",
          shopLocation: user.shopLocation || null,
          address: user.address || null,
          RegistrationNumber: user.RegistrationNumber || "",
          association: user.association || null,
        },
      });
    }

    /* ------------------------------------------
     * BRANCH 2: EMPLOYEE LOGIN (mobile + pin)
     * ------------------------------------------ */
    else if (mobile && pin) {
      console.log("🔐 EMPLOYEE LOGIN start:", mobile);

      const employee = await Employee.findOne({
        mobile,
        status: "Active",
      })
        .select("+pinHash")
        .populate("owner");

      if (!employee) {
        return res.status(404).json({
          success: false,
          message: "Employee not found or inactive",
        });
      }

      const match = await bcrypt.compare(String(pin), employee.pinHash);
      if (!match) {
        return res.status(401).json({
          success: false,
          message: "Invalid mobile or PIN",
        });
      }

      const owner = employee.owner;
      const ownerIsProfileVerified = !!owner?.isProfileVerified;

      const payload = {
        sub: employee._id.toString(),
        role: employee.role,
        provider: "local",
        subjectType: "EMPLOYEE",
      };

      const { accessToken, refreshToken } =
        generateTokensFromPayload(payload);

      employee.refreshToken = refreshToken;

      // ✅ Generate / migrate QR for EMPLOYEE (same style as member)
      if (
        !employee.qrCodeUrl ||
        String(employee.qrCodeUrl).startsWith("data:image")
      ) {
        try {
          const qrUrl = await generateEmployeeQr(employee, owner);
          employee.qrCodeUrl = qrUrl;
        } catch (qrErr) {
          console.error(
            "⚠️ QR generate error (employee login):",
            qrErr.message
          );
        }
      }

      await employee.save();

      setAuthCookies(res, { accessToken, refreshToken });

      console.log("✅ EMPLOYEE LOGIN success:", employee._id.toString());

      return res.json({
        success: true,
        message: "Employee login successful",
        loginType: "EMPLOYEE",
        accessToken,
        employee: {
          id: employee._id,
          name: employee.name,
          mobile: employee.mobile,
          role: employee.role,
          avatar: employee.avatar,
          shopName: employee.shopName,
          shopAddress: employee.shopAddress,
          qrCodeUrl: employee.qrCodeUrl,
          status: employee.status,
          ownerId: owner?._id || null,
          ownerName: owner?.name || "",
          ownerIsProfileVerified,
          profilePercent: 0,
          shopCompleted: true,
        },
      });
    }

    // If neither pattern matches
    return res.status(400).json({
      success: false,
      message:
        "Provide either (email or mobile + password) for member login or (mobile + pin) for employee login.",
    });
  } catch (err) {
    console.error("❌ Login error (merged):", err);
    return res.status(500).json({
      success: false,
      message: "Login failed",
      error: err.message,
    });
  }
};

/* =====================================================
   SEND VERIFY EMAIL OTP
===================================================== */
const sendVerifyEmailOtp = async (req, res) => {
  try {
    const { email } = req.body;

    const user = await User.findOne({ email });
    if (!user) {
      return res
        .status(404)
        .json({ success: false, message: "User not found" });
    }

    const code = String(Math.floor(100000 + Math.random() * 900000));
    await createOtp({ email, code, purpose: "verify_email" });

    await sendMail({
      to: email,
      subject: "Verify your email",
      html: verifyEmailOtpTemplate(user.name || "Member", code),
    });

    return res.json({ success: true, message: "Verification OTP sent" });
  } catch (err) {
    console.error("sendVerifyEmailOtp error:", err);
    return res.status(500).json({ success: false, error: err.message });
  }
};

/* =====================================================
   VERIFY EMAIL OTP
===================================================== */
const verifyEmailWithOtp = async (req, res) => {
  try {
    const { email, code } = req.body;

    const otp = await Otp.findOne({
      email,
      code,
      purpose: "verify_email",
      isUsed: false,
      expiresAt: { $gt: new Date() },
    });

    if (!otp) {
      return res.status(400).json({
        success: false,
        message: "Invalid or expired OTP",
      });
    }

    await Otp.updateOne({ _id: otp._id }, { isUsed: true });

    const user = await User.findOneAndUpdate(
      { email },
      { verify_email: true },
      { new: true }
    );

    return res.json({
      success: true,
      message: "Email verified successfully",
      user: {
        id: user._id,
        email: user.email,
        verify_email: true,
      },
    });
  } catch (err) {
    console.error("verifyEmailWithOtp error:", err);
    return res.status(500).json({ success: false, error: err.message });
  }
};

/* =====================================================
   SEND FORGOT PASSWORD OTP
   - purpose: "forgot_password"
===================================================== */
const sendForgotPasswordOtp = async (req, res) => {
  try {
    const { email } = req.body;

    if (!email) {
      return res.status(400).json({
        success: false,
        message: "Email is required",
      });
    }

    const user = await User.findOne({ email });
    if (!user) {
      return res
        .status(404)
        .json({ success: false, message: "User not found" });
    }

    // For Google-only accounts, password reset doesn't make sense
    if (user.provider === "google") {
      return res.status(400).json({
        success: false,
        message: "This account uses Google login. Use Google login.",
      });
    }

    const code = String(Math.floor(100000 + Math.random() * 900000));
    console.log("🔐 Forgot password OTP for", email, "=>", code);

    await createOtp({ email, code, purpose: "forgot_password" });

    await sendMail({
      to: email,
      subject: "Password Reset OTP",
      html: forgotPasswordOtpTemplate(user.name || "Member", code),
    });

    return res.json({
      success: true,
      message: "Password reset OTP sent to email",
    });
  } catch (err) {
    console.error("sendForgotPasswordOtp error:", err);
    return res.status(500).json({
      success: false,
      message: err.message || "Failed to send password reset OTP",
    });
  }
};

/* =====================================================
   RESET PASSWORD WITH OTP  (Step 3)
   Body: { email, otp, password }
===================================================== */
const verifyForgotPasswordOtp = async (req, res) => {
  try {
    const { email, otp } = req.body;

    if (!email || !otp) {
      return res.status(400).json({
        success: false,
        message: "Email and OTP are required",
      });
    }

    const otpDoc = await Otp.findOne({
      email,
      code: otp,
      purpose: "forgot_password",
      isUsed: false,
      expiresAt: { $gt: new Date() },
    });

    if (!otpDoc) {
      return res.status(400).json({
        success: false,
        message: "Invalid or expired OTP",
      });
    }

    // NOTE: do NOT mark as used here, we still need it in resetPasswordWithOtp
    return res.json({
      success: true,
      message: "OTP verified successfully",
    });
  } catch (err) {
    console.error("verifyForgotPasswordOtp error:", err);
    return res.status(500).json({ success: false, error: err.message });
  }
};

const resetPasswordWithOtp = async (req, res) => {
  try {
    const { email, otp, password } = req.body;

    if (!email || !otp || !password) {
      return res.status(400).json({
        success: false,
        message: "Email, OTP and new password are required",
      });
    }

    if (password.length < 6) {
      return res.status(400).json({
        success: false,
        message: "Password must be at least 6 characters",
      });
    }

    const otpDoc = await Otp.findOne({
      email,
      code: otp,
      purpose: "forgot_password",
      isUsed: false,
      expiresAt: { $gt: new Date() },
    });

    if (!otpDoc) {
      return res.status(400).json({
        success: false,
        message: "Invalid or expired OTP",
      });
    }

    const user = await User.findOne({ email }).select("+password");
    if (!user) {
      return res
        .status(404)
        .json({ success: false, message: "User not found" });
    }

    if (user.provider === "google") {
      return res.status(400).json({
        success: false,
        message: "This account uses Google login. Use Google login.",
      });
    }

    const hashed = await bcrypt.hash(password, 10);
    user.password = hashed;
    user.refresh_token = ""; // optional: invalidate old token

    await user.save();

    otpDoc.isUsed = true;
    await otpDoc.save();

    clearAuthCookies(res); // optional

    return res.json({
      success: true,
      message: "Password reset successfully. Please login with new password.",
    });
  } catch (err) {
    console.error("resetPasswordWithOtp error:", err);
    return res.status(500).json({ success: false, error: err.message });
  }
};

/* =====================================================
   GOOGLE LOGIN
===================================================== */
const googleLogin = async (req, res) => {
  try {
    const { idToken } = req.body;

    const ticket = await client.verifyIdToken({
      idToken,
      audience: process.env.GOOGLE_CLIENT_ID,
    });

    const info = ticket.getPayload();

    const email = info.email;
    const name = info.name || email.split("@")[0];
    const picture = info.picture;

    let user = await User.findOne({ email });

    if (!user) {
      user = await User.create({
        name,
        email,
        avatar: picture,
        provider: "google",
        verify_email: true,
      });
    } else {
      user.provider = "google";
      user.verify_email = true;
      if (!user.avatar) user.avatar = picture;
    }

    markAdminIfWhitelisted(user);

    const { accessToken, refreshToken } = generateTokens(user);
    user.refresh_token = refreshToken;
    user.last_login_date = new Date();

    try {
      const profile = computeProfilePercent(user);
      user.profilePercent = profile.total;
      user.profileBreakdown = profile;
      user.shopCompleted = hasCompletedShop(user);
    } catch (ppErr) {
      console.error("profilePercent error (googleLogin):", ppErr.message);
      user.profilePercent = user.profilePercent || 0;
      user.profileBreakdown = user.profileBreakdown || null;
      user.shopCompleted = user.shopCompleted || false;
    }

    // ✅ Generate / migrate QR for Google users as well
    if (!user.qrCodeUrl || String(user.qrCodeUrl).startsWith("data:image")) {
      try {
        const qrUrl = await generateUserQr(user);
        user.qrCodeUrl = qrUrl;
      } catch (qrErr) {
        console.error("⚠️ QR generate error (googleLogin):", qrErr.message);
      }
    }

    await user.save();

    setAuthCookies(res, { accessToken, refreshToken });

    return res.json({
      success: true,
      accessToken,
      user: {
        id: user._id,
        name: user.name,
        email: user.email,
        role: user.role,
        avatar: user.avatar,
        profilePercent: user.profilePercent || 0,
        shopCompleted: !!user.shopCompleted,
        qrCodeUrl: user.qrCodeUrl || "",
      },
    });
  } catch (err) {
    console.error("googleLogin error:", err);
    return res.status(401).json({
      success: false,
      message: "Google login failed",
      error: err.message,
    });
  }
};

/* =====================================================
   CURRENT USER
===================================================== */
const currentUser = async (req, res) => {
  try {
    const user = await User.findById(req.user._id).populate(
      "association",
      "name district area logo isActive"
    );

    if (!user) {
      return res
        .status(404)
        .json({ success: false, message: "User not found" });
    }

    try {
      const profile = computeProfilePercent(user);
      user.profilePercent = profile.total;
      user.profileBreakdown = profile;
      user.shopCompleted = hasCompletedShop(user);
    } catch (ppErr) {
      console.error("profilePercent error (currentUser):", ppErr.message);
      user.profilePercent = user.profilePercent || 0;
      user.profileBreakdown = user.profileBreakdown || null;
      user.shopCompleted = user.shopCompleted || false;
    }
    const updated = await user.save();
    const obj = updated.toObject();

    return res.json({
      success: true,
      user: {
        ...obj,
        profilePercent: updated.profilePercent || 0,
        shopCompleted: !!updated.shopCompleted,
      },
    });
  } catch (err) {
    console.error("currentUser error:", err);
    return res.status(500).json({ success: false, error: err.message });
  }
};

/* =====================================================
   LOGOUT
===================================================== */
const logout = async (req, res) => {
  try {
    // 🔹 clear refresh token depending on role
    if (req.user?.role === "EMPLOYEE") {
      await Employee.updateOne(
        { _id: req.user._id },
        { refreshToken: "" }
      );
    } else if (req.user?._id) {
      await User.updateOne({ _id: req.user._id }, { refresh_token: "" });
    }

    clearAuthCookies(res);

    return res.json({ success: true, message: "Logged out" });
  } catch (err) {
    console.error("logout error:", err);
    return res.status(500).json({ success: false, error: err.message });
  }
};

/* =====================================================
   CHANGE PASSWORD (LOGGED-IN USER)
   Body: { currentPassword, newPassword, confirmPassword }
===================================================== */
const changePassword = async (req, res) => {
  try {
    const { currentPassword, newPassword, confirmPassword } = req.body;

    if (!currentPassword || !newPassword || !confirmPassword) {
      return res.status(400).json({
        success: false,
        message: "Current password, new password and confirm password are required",
      });
    }

    if (newPassword.length < 6) {
      return res.status(400).json({
        success: false,
        message: "New password must be at least 6 characters",
      });
    }

    if (newPassword !== confirmPassword) {
      return res.status(400).json({
        success: false,
        message: "New password and confirm password do not match",
      });
    }

    const user = await User.findById(req.user._id).select("+password +provider");
    if (!user) {
      return res.status(404).json({ success: false, message: "User not found" });
    }

    if (user.provider === "google") {
      return res.status(400).json({
        success: false,
        message: "Google accounts cannot change password",
      });
    }

    if (!user.password) {
      return res.status(400).json({
        success: false,
        message: "This account does not have a password set",
      });
    }

    // ✅ Check old password from DB
    const match = await bcrypt.compare(String(currentPassword), user.password);
    if (!match) {
      return res.status(400).json({
        success: false,
        message: "Current password incorrect",
      });
    }

    // ✅ Save new password
    user.password = await bcrypt.hash(String(newPassword), 10);

    // Optional: invalidate refresh token
    user.refresh_token = "";

    await user.save();

    return res.json({
      success: true,
      message: "Password changed successfully",
    });
  } catch (err) {
    console.error("changePassword error:", err);
    return res.status(500).json({
      success: false,
      message: "Failed to change password",
      error: err.message,
    });
  }
};

module.exports = {
  register,
  login,
  sendVerifyEmailOtp,
  verifyEmailWithOtp,
  sendForgotPasswordOtp,
  verifyForgotPasswordOtp,
  resetPasswordWithOtp,
  googleLogin,
  logout,
  currentUser,
  changePassword,
};
