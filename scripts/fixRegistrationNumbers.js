// server/scripts/fixRegistrationNumbers.js
require("dotenv").config();
const mongoose = require("mongoose");

// adjust this path if needed
const User = require("../src/models/user.model");

// 1. Mongo URI – use your existing one / .env
const MONGODB_URI =
  process.env.MONGODB_URI ||
  "mongodb+srv://globogreen:gzVJW0bFWzYG4uP4@globogreen-cluster01.lhlbh.mongodb.net/Association";

/**
 * Clean name → UPPERCASE, remove spaces & symbols
 */
function cleanName(name) {
  return (name || "")
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, ""); // keep only A-Z & 0-9
}

(async () => {
  try {
    console.log("🔌 Connecting to MongoDB...");
    await mongoose.connect(MONGODB_URI);
    console.log("✅ Connected.");

    // 2. Find only OWNERs that still have old TNMA format
    const owners = await User.find({
      role: "OWNER",
      RegistrationNumber: { $regex: /^TNMA-/ }, // old pattern
    }).sort({ createdAt: 1 }); // oldest first

    console.log(`👀 Found ${owners.length} OWNER(s) with old TNMA RegNo.`);

    // Counter per year: { "2025": 3, "2026": 7, ... }
    const yearCounters = {};

    for (const user of owners) {
      const year = (user.createdAt || new Date()).getFullYear().toString();
      const nameClean = cleanName(user.name);

      if (!yearCounters[year]) yearCounters[year] = 0;
      yearCounters[year] += 1;

      const seq = String(yearCounters[year]).padStart(3, "0"); // 001,002,...

      const newRegNo = `${nameClean}-CTMA-${year}-${seq}`;

      console.log(
        `➡️ ${user._id} | ${user.name} : ${user.RegistrationNumber}  -->  ${newRegNo}`
      );

      user.RegistrationNumber = newRegNo;
      await user.save();
    }

    console.log("🎉 Done updating RegistrationNumber for all matched OWNERs.");
    await mongoose.disconnect();
    process.exit(0);
  } catch (err) {
    console.error("❌ Error in fixRegistrationNumbers script:", err);
    process.exit(1);
  }
})();
