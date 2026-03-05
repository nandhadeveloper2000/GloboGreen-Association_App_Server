const Subscription = require("../models/subscription.model");
const User = require("../models/user.model");
const uploadBufferToCloudinary = require("../utils/uploadToCloudinary");

const ALLOWED_STATUS = ["PAID", "FAILED"];
const ALLOWED_PAYMENT_MODES = ["CASH", "UPI", "BANK", "CARD"];

/* -------------------------------------------------------------------------- */
/*                            CREATE / UPDATE                                 */
/* -------------------------------------------------------------------------- */
const createOrUpdateSubscription = async (req, res) => {
  try {
    const adminUser = req.user;
    const { memberId } = req.params;

    const {
      monthKey,
      subscriptionAmount,
      meetingAmount,
      status,
      paidDate,
      paymentMode,
      referenceNo,
      notes,
      extraFields,
    } = req.body;

    /* ------------------------------ validation ----------------------------- */
    if (!memberId) {
      return res.status(400).json({ success: false, message: "memberId missing" });
    }

    if (!monthKey || subscriptionAmount === undefined || subscriptionAmount === "") {
      return res.status(400).json({
        success: false,
        message: "monthKey and subscriptionAmount are required",
      });
    }

    const member = await User.findById(memberId).lean();
    if (!member) {
      return res.status(404).json({ success: false, message: "Member not found" });
    }

    /* ------------------------- parse extraFields --------------------------- */
    let parsedExtraFields = [];
    if (extraFields) {
      try {
        const raw =
          typeof extraFields === "string" ? JSON.parse(extraFields) : extraFields;

        if (Array.isArray(raw)) {
          parsedExtraFields = raw
            .filter((f) => f && f.key && String(f.key).trim())
            .map((f) => ({
              key: String(f.key).trim(),
              value:
                f.value === undefined || f.value === null
                  ? ""
                  : String(f.value).trim(),
            }));
        }
      } catch (e) {
        parsedExtraFields = [];
      }
    }

    /* --------------------------- receipt upload ---------------------------- */
    let attachmentUrl = "";
    if (req.file) {
      const upload = await uploadBufferToCloudinary(
        req.file.buffer,
        "subscriptions"
      );
      attachmentUrl = upload?.secure_url || upload?.url || "";
    }

    /* ------------------------------- payload ------------------------------- */
    const payload = {
      member: memberId,
      monthKey: String(monthKey).trim(),

      subscriptionAmount: Number(subscriptionAmount),
      meetingAmount: Number(meetingAmount) || 0,

      status: ALLOWED_STATUS.includes(status) ? status : "PAID",
      paidDate: paidDate ? new Date(paidDate) : new Date(),

      paymentMode: ALLOWED_PAYMENT_MODES.includes(paymentMode)
        ? paymentMode
        : "CASH",

      referenceNo: referenceNo ? String(referenceNo).trim() : "",
      notes: notes ? String(notes).trim() : "",

      extraFields: parsedExtraFields,

      createdBy: adminUser?._id,
    };

    // only overwrite attachment if new file uploaded
    if (attachmentUrl) payload.attachmentUrl = attachmentUrl;

    /* ------------------------- upsert subscription ------------------------- */
    const subscription = await Subscription.findOneAndUpdate(
      { member: memberId, monthKey: payload.monthKey },
      { $set: payload },
      { new: true, upsert: true }
    )
      .populate("member", "name mobile shopName role")
      .lean();

    return res.json({
      success: true,
      message: "Subscription saved successfully",
      data: subscription,
    });
  } catch (err) {
    // unique index conflict (rare race condition)
    if (err?.code === 11000) {
      return res.status(409).json({
        success: false,
        message: "Subscription already exists for this member & month",
      });
    }

    return res.status(500).json({
      success: false,
      message: "Server error",
      error: err.message,
    });
  }
};

/* -------------------------------------------------------------------------- */
/*                         GET BY MEMBER (ADMIN)                               */
/* -------------------------------------------------------------------------- */
const getSubscriptionsByMember = async (req, res) => {
  try {
    const { memberId } = req.params;

    const subs = await Subscription.find({ member: memberId })
      .populate("member", "name mobile shopName role")
      .sort({ monthKey: -1 })
      .lean();

    return res.json({ success: true, data: subs });
  } catch (err) {
    return res.status(500).json({
      success: false,
      message: "Failed to load subscriptions",
      error: err.message,
    });
  }
};

/* -------------------------------------------------------------------------- */
/*                         GET MY SUBSCRIPTIONS (USER)                         */
/* -------------------------------------------------------------------------- */
const getMySubscriptions = async (req, res) => {
  try {
    const subs = await Subscription.find({ member: req.user._id })
      .populate("member", "name mobile shopName role")
      .sort({ monthKey: -1 })
      .lean();

    return res.json({ success: true, data: subs });
  } catch (err) {
    return res.status(500).json({
      success: false,
      message: "Failed to load subscriptions",
      error: err.message,
    });
  }
};

/* -------------------------------------------------------------------------- */
/*                         GET ALL (ADMIN DASHBOARD)                           */
/* -------------------------------------------------------------------------- */
const getAllSubscriptionsAdmin = async (req, res) => {
  try {
    const subs = await Subscription.find({})
      .populate({
        path: "member",
        select: "name mobile shopName role",
        match: { role: "OWNER" }, // only owners
      })
      .sort({ monthKey: -1, createdAt: -1 })
      .lean();

    // remove rows where populate failed
    const filtered = subs.filter((s) => s.member);

    return res.json({ success: true, data: filtered });
  } catch (err) {
    return res.status(500).json({
      success: false,
      message: "Failed to load subscriptions",
      error: err.message,
    });
  }
};

module.exports = {
  createOrUpdateSubscription,
  getSubscriptionsByMember,
  getMySubscriptions,
  getAllSubscriptionsAdmin,
};
