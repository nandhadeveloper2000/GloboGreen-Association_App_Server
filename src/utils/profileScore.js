// utils/profileScore.js

function computeProfilePercent(user) {
  if (!user) {
    return {
      profileBasics: 0,
      memberAddress: 0,
      shopBasic: 0,
      shopAddress: 0,
      shopPhotos: 0,
      businessDetails: 0,
      total: 0,
    };
  }

  const addr = user.address || {};
  const sa = user.shopAddress || {};

  // 🎯 Weights must add up to 100
  const WEIGHTS = {
    profileBasics: 35,   // name, mobile (WhatsApp), 
    memberAddress: 20,
    shopBasic: 15,
    shopAddress: 20,
    shopPhotos: 20,
  };

  /* ---------- Profile basics (25%) ---------- */
  const basicsChecks = [
    !!user.name,                    // Name
    !!user.mobile,                  // Mobile / WhatsApp
  ];
  const basicsDone = basicsChecks.filter(Boolean).length;
  const profileBasicsRaw =
    (basicsDone / basicsChecks.length) * WEIGHTS.profileBasics;
  const profileBasics = Math.round(profileBasicsRaw);

  /* ---------- Member address (20%) ---------- */
  const memberAddressChecks = [
    !!addr.street,
    !!addr.city,
    !!addr.pincode,
  ];
  const memberAddressDone = memberAddressChecks.filter(Boolean).length;
  const memberAddressRaw =
    (memberAddressDone / memberAddressChecks.length) * WEIGHTS.memberAddress;
  const memberAddress = Math.round(memberAddressRaw);

  /* ---------- Shop basic (15%) ---------- */
  const shopBasicChecks = [
    !!user.shopName,
    !!user.BusinessType,
    !!user.BusinessCategory,
  ];
  const shopBasicDone = shopBasicChecks.filter(Boolean).length;
  const shopBasicRaw =
    (shopBasicDone / shopBasicChecks.length) * WEIGHTS.shopBasic;
  const shopBasic = Math.round(shopBasicRaw);

  /* ---------- Shop address (20%) ---------- */
  const shopAddressChecks = [
    !!sa.street,
    !!sa.city,
    !!sa.pincode,
  ];
  const shopAddressDone = shopAddressChecks.filter(Boolean).length;
  const shopAddressRaw =
    (shopAddressDone / shopAddressChecks.length) * WEIGHTS.shopAddress;
  const shopAddress = Math.round(shopAddressRaw);

  /* ---------- Shop photos (20%) ---------- */
  const hasBothPhotos = !!user.shopFront && !!user.shopBanner;
  const shopPhotos = hasBothPhotos ? WEIGHTS.shopPhotos : 0;

  /* ---------- Total (0–100) ---------- */
  const totalRaw =
    profileBasics +
    memberAddress +
    shopBasic +
    shopAddress +
    shopPhotos;

  const total = Math.min(100, Math.round(totalRaw));

  return {
    profileBasics,
    memberAddress,
    shopBasic,
    shopAddress,
    shopPhotos,
    businessDetails: 0, // kept for compatibility
    total,
  };
}

module.exports = { computeProfilePercent };
