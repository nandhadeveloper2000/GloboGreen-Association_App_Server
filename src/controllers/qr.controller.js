// server/controllers/qr.controller.js
const User = require("../models/user.model");
const Employee = require("../models/employee.model");
const ScanHistory = require("../models/scanHistory.model");

/* ---------------- helper: parse QR payload ---------------- */
/**
 * raw can be:
 *  - TNMA JSON:
 *      { t: "TNMA_OWNER", userId: "...", shopName: "...", ... }
 *      { t: "TNMA_EMPLOYEE", employeeId: "...", ownerId: "...", ... }
 *  - Generic JSON: { id: "...", type: "OWNER"|"EMPLOYEE", shopName: "..." }
 *  - Plain ObjectId string
 *  - URL containing id
 */
const parseQrPayload = (raw) => {
  let parsed = null;
  let idCandidate = null;
  let type = null;
  let shopName = "";
  let productName = "";

  // Try JSON first
  if (typeof raw === "string") {
    try {
      parsed = JSON.parse(raw);
    } catch {
      parsed = null;
    }
  }

  if (parsed && typeof parsed === "object") {
    // 🔹 TNMA OWNER QR
    if (parsed.t === "TNMA_OWNER" && parsed.userId) {
      idCandidate = parsed.userId;
      type = "OWNER";
      shopName = parsed.shopName || "";
    }
    // 🔹 TNMA EMPLOYEE QR
    else if (parsed.t === "TNMA_EMPLOYEE" && parsed.employeeId) {
      idCandidate = parsed.employeeId;
      type = "EMPLOYEE";
      shopName = parsed.shopName || "";
    }
    // 🔹 Generic JSON style: { id, type }
    else if (parsed.id) {
      idCandidate = parsed.id;
      type = parsed.type || null;
      shopName = parsed.shopName || "";
      productName = parsed.productName || "";
    }

    return { idCandidate, type, shopName, productName, parsed };
  }

  // 🔹 If it's a URL, try to pull id from path or query
  if (raw && typeof raw === "string" && raw.startsWith("http")) {
    try {
      const urlObj = new URL(raw);
      const parts = urlObj.pathname.split("/").filter(Boolean);
      if (parts.length > 0) {
        idCandidate = parts[parts.length - 1];
      }

      const queryId =
        urlObj.searchParams.get("id") ||
        urlObj.searchParams.get("memberId") ||
        urlObj.searchParams.get("userId");
      if (queryId) {
        idCandidate = queryId;
      }
    } catch {
      // ignore parse error
    }

    return { idCandidate, type, shopName, productName, parsed: null };
  }

  // 🔹 Fallback: treat raw as direct id (maybe plain ObjectId)
  if (typeof raw === "string") {
    idCandidate = raw.trim();
  }

  return { idCandidate, type, shopName, productName, parsed: null };
};

/* --------- helper: check if target QR should be blocked --------- */
const checkTargetVerification = async ({ owner, employee }) => {
  if (owner) {
    if (!owner.isProfileVerified) {
      return {
        blocked: true,
        code: "OWNER_NOT_VERIFIED",
        message: "This shop is not verified yet. QR is temporarily blocked.",
      };
    }
    return { blocked: false };
  }

  if (employee) {
    if (employee.parentOwner) {
      const parentOwner = await User.findById(employee.parentOwner).select(
        "isProfileVerified shopName"
      );
      if (!parentOwner || !parentOwner.isProfileVerified) {
        return {
          blocked: true,
          code: "OWNER_NOT_VERIFIED",
          message:
            "This shop is not verified yet. Employee QR is temporarily blocked.",
        };
      }
    }
    return { blocked: false };
  }

  return {
    blocked: true,
    code: "INVALID_QR",
    message: "Invalid or unsupported QR code.",
  };
};

/**
 * POST /api/qr/scan
 * Body: { raw, actionType?, notes? }
 *  actionType = "BUY" | "RETURN" (optional)
 * Auth: OWNER or EMPLOYEE (req.user from auth middleware)
 */
const scanQr = async (req, res) => {
  try {
    const { raw, actionType, notes } = req.body || {};
    if (!raw) {
      return res.status(400).json({
        success: false,
        code: "INVALID_QR_FORMAT",
        message: "QR payload is required.",
      });
    }

    const authUser = req.user;
    if (!authUser) {
      return res.status(401).json({
        success: false,
        message: "Not authenticated.",
      });
    }

    // 1️⃣ OWNER not verified → cannot scan at all
    if (authUser.role === "OWNER" && authUser.isProfileVerified === false) {
      return res.status(403).json({
        success: false,
        code: "SCANNER_NOT_VERIFIED",
        message:
          "Your shop profile is not verified yet. You cannot scan QR codes.",
      });
    }

    // 2️⃣ Parse QR payload
    const { idCandidate, type, parsed } = parseQrPayload(raw);

    // If this was JSON but not our TNMA format → block immediately
    if (parsed && !parsed.t && !parsed.id) {
      return res.status(400).json({
        success: false,
        code: "INVALID_QR_FORMAT",
        message: "Only TNMA member QR codes can be used here.",
      });
    }

    if (!idCandidate) {
      return res.status(400).json({
        success: false,
        code: "INVALID_QR_FORMAT",
        message: "Only TNMA member QR codes can be used here.",
      });
    }

    let targetOwner = null;
    let targetEmployee = null;
    let targetType = null;

    // 2.1️⃣ Try based on explicit type first
    if (type === "OWNER") {
      targetOwner = await User.findById(idCandidate).select(
        "name shopName isProfileVerified role shopAddress"
      );
      if (!targetOwner) {
        return res.status(404).json({
          success: false,
          code: "OWNER_NOT_FOUND",
          message: "Owner not found for this QR.",
        });
      }
      targetType = "OWNER";
    } else if (type === "EMPLOYEE") {
      targetEmployee = await Employee.findById(idCandidate).select(
        "name shopName parentOwner"
      );
      if (!targetEmployee) {
        return res.status(404).json({
          success: false,
          code: "EMPLOYEE_NOT_FOUND",
          message: "Employee not found for this QR.",
        });
      }
      targetType = "EMPLOYEE";
    } else {
      // 2.2️⃣ Fallback: treat as OWNER id
      try {
        targetOwner = await User.findById(idCandidate).select(
          "name shopName isProfileVerified role shopAddress"
        );
      } catch (e) {
        // bad ObjectId format
        return res.status(400).json({
          success: false,
          code: "INVALID_QR_FORMAT",
          message: "Only TNMA member QR codes can be used here.",
        });
      }

      if (!targetOwner) {
        return res.status(404).json({
          success: false,
          code: "INVALID_QR",
          message: "Invalid QR code.",
        });
      }
      targetType = "OWNER";
    }

    // 3️⃣ Check target shop verification
    const verificationResult = await checkTargetVerification({
      owner: targetOwner,
      employee: targetEmployee,
    });

    if (verificationResult.blocked) {
      return res.status(403).json({
        success: false,
        code: verificationResult.code,
        message: verificationResult.message,
      });
    }

    // 3.5️⃣ OWNER rule: cannot scan own shop (self or own employees)
    if (authUser.role === "OWNER") {
      const qrOwnerId =
        (targetOwner && targetOwner._id) ||
        (targetEmployee && targetEmployee.parentOwner) ||
        null;

      if (qrOwnerId && String(qrOwnerId) === String(authUser._id)) {
        return res.status(403).json({
          success: false,
          code: "OWNER_OWN_SHOP_BLOCKED",
          message:
            "You cannot scan QR codes of your own shop. Only other shops' QR codes are allowed.",
        });
      }
    }

    // 3.6️⃣ EMPLOYEE rule: can NOT scan own-shop QR (only other shops)
    if (authUser.role === "EMPLOYEE") {
      const myOwnerId =
        authUser.parentOwner || authUser.owner || authUser.ownerId || null;

      const qrOwnerId =
        (targetOwner && targetOwner._id) ||
        (targetEmployee && targetEmployee.parentOwner) ||
        null;

      if (myOwnerId && qrOwnerId) {
        if (String(myOwnerId) === String(qrOwnerId)) {
          return res.status(403).json({
            success: false,
            code: "EMPLOYEE_OWN_SHOP_BLOCKED",
            message:
              "You cannot scan QR codes of your own shop. Only other shops' QR codes are allowed.",
          });
        }
      }
    }

    // 4️⃣ Decide actionType
    let finalActionType = "UNKNOWN";
    if (actionType === "BUY" || actionType === "RETURN") {
      finalActionType = actionType;
    }

    // 5️⃣ Resolve opposite user & shop snapshot + owner ids
    let oppositeUser = null;
    let oppositeShopName = "";
    let targetOwnerId = null;

    if (targetOwner) {
      oppositeUser = targetOwner;
      oppositeShopName = targetOwner.shopName || "";
      targetOwnerId = targetOwner._id;
    } else if (targetEmployee) {
      if (targetEmployee.parentOwner) {
        const parentOwner = await User.findById(
          targetEmployee.parentOwner
        ).select("name shopName");
        if (parentOwner) {
          oppositeUser = parentOwner;
          oppositeShopName =
            targetEmployee.shopName || parentOwner.shopName || "";
          targetOwnerId = parentOwner._id;
        }
      }

      if (!oppositeUser) {
        return res.status(400).json({
          success: false,
          code: "INVALID_TARGET",
          message: "Could not resolve shop owner from this QR.",
        });
      }
    }

    if (!oppositeUser) {
      return res.status(400).json({
        success: false,
        code: "INVALID_TARGET",
        message: "Could not resolve shop owner from this QR.",
      });
    }

    // 5.2️⃣ scannerOwner (OWNER side of the scanner)
    let scannerOwnerId = null;
    if (authUser.role === "OWNER") {
      scannerOwnerId = authUser._id;
    } else if (authUser.role === "EMPLOYEE") {
      scannerOwnerId =
        authUser.parentOwner || authUser.owner || authUser.ownerId || null;
    }

    const fromUser = authUser;
    const toUser = oppositeUser;

    const fromName = fromUser.name || "Member";
    const fromShopName = fromUser.shopName || "";

    const toName = toUser.name || "Member";
    const toShopName = oppositeShopName || toUser.shopName || "";

    const fromRole = authUser.role || "UNKNOWN";
    const toRole = targetType === "EMPLOYEE" ? "EMPLOYEE" : "OWNER";

    // 6️⃣ Save scan history
    let historyDoc = null;
    try {
      historyDoc = await ScanHistory.create({
        fromUser: fromUser._id,
        toUser: toUser._id,

        fromRole,
        toRole,
        scannerOwner: scannerOwnerId,
        targetOwner: targetOwnerId,

        fromName,
        toName,
        fromShopName,
        toShopName,
        actionType: finalActionType,
        notes: (notes || "").trim(),
      });
    } catch (err) {
      console.error("ScanHistory create error:", err.message);
    }

    // 7️⃣ Response payload
    return res.json({
      success: true,
      code: "SCAN_OK",
      data: {
        historyId: historyDoc ? historyDoc._id : null,
        actionType: finalActionType,
        targetType,
        owner: targetOwner
          ? {
              id: targetOwner._id,
              name: targetOwner.name,
              shopName: targetOwner.shopName,
              address: targetOwner.shopAddress,
            }
          : null,
        employee: targetEmployee
          ? {
              id: targetEmployee._id,
              name: targetEmployee.name,
              shopName: targetEmployee.shopName,
            }
          : null,
      },
    });
  } catch (err) {
    console.error("scanQr error:", err);
    return res.status(500).json({
      success: false,
      message: "Something went wrong while scanning QR.",
    });
  }
};

/**
 * GET /api/qr/my
 * Get logged in user's QR (OWNER or EMPLOYEE)
 */
const getMyQr = async (req, res) => {
  try {
    const user = req.user;

    // OWNER: use user.qrCodeUrl from User model
    if (user.role === "OWNER") {
      if (!user.isProfileVerified) {
        return res.status(403).json({
          success: false,
          code: "OWNER_NOT_VERIFIED",
          message:
            "Your profile is not verified yet. You will get your QR after verification.",
        });
      }

      return res.json({
        success: true,
        qrCodeUrl: user.qrCodeUrl || "",
        type: "OWNER",
      });
    }

    // EMPLOYEE: use Employee collection (req.user is employee-like object)
    if (user.role === "EMPLOYEE") {
      const employee = await Employee.findById(user._id).select(
        "qrCodeUrl parentOwner shopName"
      );

      if (!employee) {
        return res.status(404).json({
          success: false,
          message: "Employee record not found.",
        });
      }

      if (employee.parentOwner) {
        const owner = await User.findById(employee.parentOwner).select(
          "isProfileVerified"
        );
        if (!owner || !owner.isProfileVerified) {
          return res.status(403).json({
            success: false,
            code: "OWNER_NOT_VERIFIED",
            message:
              "Shop is not verified yet. Employee QR will be available after verification.",
          });
        }
      }

      return res.json({
        success: true,
        qrCodeUrl: employee.qrCodeUrl || "",
        type: "EMPLOYEE",
        shopName: employee.shopName,
      });
    }

    return res.status(403).json({
      success: false,
      message: "QR is not available for this role.",
    });
  } catch (err) {
    console.error("getMyQr error:", err);
    return res.status(500).json({
      success: false,
      message: "Something went wrong while fetching QR.",
    });
  }
};

/**
 * GET /api/qr/history
 *
 * OWNER   : sees own scans + all employees' scans (shop-level history)
 * EMPLOYEE: sees the SAME shop-level history as owner
 * USER    : sees only their own scans (if ever used)
 */
const getScanHistory = async (req, res) => {
  try {
    const user = req.user;
    const limit = Math.min(Number(req.query.limit || 50), 500);

    let ownerIdForShop = null;

    if (user.role === "OWNER") {
      ownerIdForShop = user._id;
    } else if (user.role === "EMPLOYEE") {
      ownerIdForShop =
        user.parentOwner || user.owner || user.ownerId || null;

      if (!ownerIdForShop) {
        const empDoc = await Employee.findById(user._id).select(
          "parentOwner owner"
        );
        if (empDoc) {
          ownerIdForShop = empDoc.parentOwner || empDoc.owner;
        }
      }
    }

    let items;

    if (ownerIdForShop) {
      // OWNER + EMPLOYEE → shop-level history (scannerOwner/targetOwner)
      items = await ScanHistory.find({
        $or: [
          { scannerOwner: ownerIdForShop },
          { targetOwner: ownerIdForShop },
        ],
      })
        .sort({ createdAt: -1 })
        .limit(limit)
        .lean();
    } else {
      // USER → only their own scans
      const selfId = user._id.toString();

      items = await ScanHistory.find({
        $or: [{ fromUser: selfId }, { toUser: selfId }],
      })
        .sort({ createdAt: -1 })
        .limit(limit)
        .lean();
    }

    // Map into shape expected by mobile app
    const mapped = items.map((doc) => {
      const fromId = String(doc.fromUser);
      const toId = String(doc.toUser);
      const selfId = user._id.toString();

      const senderIsSelf = fromId === selfId;
      const receiverIsSelf = toId === selfId;

      let isSender;
      if (senderIsSelf && !receiverIsSelf) {
        isSender = true;
      } else if (!senderIsSelf && receiverIsSelf) {
        isSender = false;
      } else {
        // both or neither → default to sender side
        isSender = senderIsSelf;
      }

      return {
        id: String(doc._id),

        selfRole: isSender ? "SENDER" : "RECEIVER",

        myName: isSender ? doc.fromName : doc.toName,
        myShopName: isSender ? doc.fromShopName : doc.toShopName,

        oppositeName: isSender ? doc.toName : doc.fromName,
        oppositeShopName: isSender ? doc.toShopName : doc.fromShopName,

        // 🔹 send roles so app can show Owner / Employee / Member
        fromRole: doc.fromRole || "UNKNOWN",
        toRole: doc.toRole || "UNKNOWN",

        actionType: doc.actionType || "UNKNOWN",
        notes: doc.notes || "",
        createdAt: doc.createdAt,
      };
    });

    return res.json({
      success: true,
      data: mapped,
    });
  } catch (err) {
    console.error("getScanHistory error:", err);
    return res.status(500).json({
      success: false,
      message: "Something went wrong while fetching scan history.",
    });
  }
};


module.exports = {
  scanQr,
  getMyQr,
  getScanHistory,
};
