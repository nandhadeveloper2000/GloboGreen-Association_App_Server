// utils/sendMail.js
const nodemailer = require("nodemailer");

const transporter = nodemailer.createTransport({
  service: "gmail",
  auth: {
    user: process.env.NODEMAILER_EMAIL,
    pass: process.env.NODEMAILER_PASSWORD,
  },
});

async function sendMail({ to, subject, html }) {
  await transporter.sendMail({
    from: process.env.FROM_EMAIL || process.env.NODEMAILER_EMAIL,
    to,
    subject,
    html,
  });
}

/* ================== TEMPLATES ================== */

function verifyEmailOtpTemplate(name = "", otp = "") {
  return `
  <div style="font-family: Arial, sans-serif; line-height: 1.6; color: #333;">
    <h2 style="color: #4CAF50;">Email Verification</h2>
    <p>Hi ${name},</p>
    <p>Your One-Time Password (OTP) for email verification is:</p>
    <h1 style="color: #4CAF50;">${otp}</h1>
    <p>This OTP is valid for the next 10 minutes. Please do not share it with anyone.</p>
    <p>If you did not request this, please ignore this email.</p>
    <br/>
    <p>Best regards,<br/>The Association App Team</p>
  </div>`;
}

function resetPasswordOtpTemplate(name = "", otp = "") {
  return `
  <div style="font-family: Arial, sans-serif; line-height: 1.6; color: #333;">
    <h2 style="color: #FF5722;">Password Reset Request</h2>
    <p>Hi ${name},</p>
    <p>Your One-Time Password (OTP) for resetting your password is:</p>
    <h1 style="color: #FF5722;">${otp}</h1>
    <p>This OTP is valid for the next 10 minutes. Please do not share it with anyone.</p>
    <p>If you did not request this, please ignore this email.</p>
    <br/>
    <p>Best regards,<br/>The Association App Team</p>
  </div>`;
}

function loginOtpTemplate(name = "", otp = "") {
  return `
  <div style="font-family: Arial, sans-serif; line-height: 1.6; color: #333;">
    <h2 style="color: #2196F3;">Login OTP</h2>
    <p>Hi ${name},</p>
    <p>Your One-Time Password (OTP) for login is:</p>
    <h1 style="color: #2196F3;">${otp}</h1>
    <p>This OTP is valid for the next 10 minutes. Please do not share it with anyone.</p>
    <p>If you did not request this, please ignore this email.</p>
    <br/>
    <p>Best regards,<br/>The Association App Team</p>
  </div>`;
}

function forgotPasswordOtpTemplate(name = "", otp = "") {
  return `
  <div style="font-family: Arial, sans-serif; line-height: 1.6; color: #333;">
    <h2 style="color: #FF9800;">Reset Your Password</h2>
    <p>Hi ${name},</p>
    <p>Your OTP to reset your password is:</p>
    <h1 style="color: #FF9800;">${otp}</h1>
    <p>This OTP will expire in 10 minutes. Please do not share this code with anyone.</p>
    <br/>
    <p>Best regards,<br/>The Association App Team</p>
  </div>`;
}

module.exports = {
  sendMail,
  verifyEmailOtpTemplate,
  resetPasswordOtpTemplate,
  loginOtpTemplate,
  forgotPasswordOtpTemplate,
};
