// controllers/admin.controller.js
const User = require("../models/user.model");
const Association = require("../models/association.model");
const Kyc = require("../models/kyc.model");
const Subscription = require("../models/subscription.model");

const adminStats = async (req, res) => {
  try {
    const totalUsers = await User.countDocuments({
      role: { $in: ["USER", "OWNER"] },
    });

    const totalAssociations = await Association.countDocuments();

    const [kycPending, kycApproved, kycRejected] = await Promise.all([
      Kyc.countDocuments({ status: "PENDING" }),
      Kyc.countDocuments({ status: "APPROVED" }),
      Kyc.countDocuments({ status: "REJECTED" }),
    ]);

    const now = new Date();
    const monthKey = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;

    const [
      paidSubscriptions,
      failedSubscriptions,
      paidThisMonth,
      failedThisMonth,
    ] = await Promise.all([
      Subscription.countDocuments({ status: "PAID" }),
      Subscription.countDocuments({ status: "FAILED" }),
      Subscription.countDocuments({ status: "PAID", monthKey }),
      Subscription.countDocuments({ status: "FAILED", monthKey }),
    ]);

    const [subscriptionTotals] = await Subscription.aggregate([
      {
        $group: {
          _id: null,
          totalSubscriptionAmount: { $sum: "$subscriptionAmount" },
          totalMeetingAmount: { $sum: "$meetingAmount" },
          totalCollected: { $sum: { $add: ["$subscriptionAmount", "$meetingAmount"] } },
        },
      },
    ]);

    return res.json({
      success: true,
      stats: {
        totalUsers,
        totalAssociations,

        kycPending,
        kycApproved,
        kycRejected,

        // Dashboard naming (stable)
        activeSubscriptions: paidSubscriptions,
        failedSubscriptions,
        paidThisMonth,
        failedThisMonth,

        totalSubscriptionAmount: subscriptionTotals?.totalSubscriptionAmount || 0,
        totalMeetingAmount: subscriptionTotals?.totalMeetingAmount || 0,
        totalCollected: subscriptionTotals?.totalCollected || 0,
      },
    });
  } catch (error) {
    console.error("Admin stats error:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to load admin dashboard stats",
    });
  }
};

module.exports = { adminStats };
