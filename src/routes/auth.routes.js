// server/routes/auth.routes.js
const express = require("express");
const router = express.Router();
const { auth } = require("../middleware/auth");

const {
  register,
  login,
  sendVerifyEmailOtp,
  verifyEmailWithOtp,
  googleLogin,
  logout,
  currentUser,
  changePassword,
  sendForgotPasswordOtp,
  resetPasswordWithOtp,
  verifyForgotPasswordOtp,
} = require("../controllers/auth.controller");

/* ----- AUTH ----- */
router.post("/register", register);
router.post("/login", login);

// Email verification
router.post("/send-verify-email-otp", sendVerifyEmailOtp);
router.post("/verify-email-otp", verifyEmailWithOtp);


// Google login
router.post("/google-login", googleLogin);

// 🔹 Forgot password flow (matches your UI screens)
router.post("/forgot-password-otp", sendForgotPasswordOtp); 
router.post("/verify-forgot-password-otp", verifyForgotPasswordOtp);
router.post("/reset-password", resetPasswordWithOtp);     

// Authenticated user endpoints
router.get("/current-user", auth, currentUser);
router.post("/logout", auth, logout);
router.post("/change-password", auth, changePassword);
router.get("/me", auth, currentUser);    

module.exports = router;
