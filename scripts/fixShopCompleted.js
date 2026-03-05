// scripts/fixShopCompleted.js
const mongoose = require("mongoose");
const path = require("path");

// load .env from server root
require("dotenv").config({
  path: path.join(__dirname, "..", ".env"),
});

// 👉 use the same URI that your server uses
//    If your env variable is different, change this line accordingly.
const MONGO_URI =
  process.env.MONGO_URI ||
  "mongodb+srv://globogreen:gzVJW0bFWzYG4uP4@globogreen-cluster01.lhlbh.mongodb.net/Association";

// ❗ FIXED PATH HERE
const User = require("../src/models/user.model");

// same helper as in user.controller.js
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

  const hasPhotos = !!u.shopFront && !!u.shopBanner;

  return (
    !!u.shopName &&
    !!u.BusinessType &&
    !!u.BusinessCategory &&
    hasAddress &&
    hasLocation &&
    hasPhotos
  );
};

(async () => {
  try {
    console.log("🔌 Connecting to Mongo...");
    await mongoose.connect(MONGO_URI);
    console.log("✅ Connected");

    const users = await User.find({});
    console.log("👥 Users:", users.length);

    let changed = 0;

    for (const u of users) {
      const correct = hasCompletedShop(u);
      if (u.shopCompleted !== correct) {
        u.shopCompleted = correct;
        await u.save();
        changed++;
      }
    }

    console.log(`✅ Fixed users: ${changed}`);
    process.exit(0);
  } catch (err) {
    console.error("❌ Error:", err);
    process.exit(1);
  }
})();
