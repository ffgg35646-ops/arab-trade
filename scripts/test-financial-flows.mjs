import assert from "node:assert/strict";
import mongoose from "mongoose";
import { SignJWT } from "jose";

const uri = process.env.MONGODB_URI || "";
const secretText = process.env.AUTH_SECRET || "";
const baseUrl = process.env.BASE_URL || "http://127.0.0.1:3000";
const mode = process.env.FINANCIAL_TEST_MODE || "run";

if (!uri || !secretText) throw new Error("MONGODB_URI and AUTH_SECRET are required");
const parsedUri = new URL(uri);
if (parsedUri.pathname.replace("/", "") !== "arabtrade_test") {
  throw new Error("Safety check: this integration test only accepts the arabtrade_test database");
}

const conn = await mongoose.connect(uri);
const db = conn.connection.db;
if (!db) throw new Error("MongoDB database connection is unavailable");

async function prepare() {
  await db.dropDatabase();
  const names = [
    "users", "platformsettings", "depositrequests", "depositbalances",
    "investmentpackages", "userpackages", "packageledgers", "withdrawalrequests",
    "wallets", "ledgerentries", "referralcommissions", "blockchaindepositclaims",
    "notifications", "paymentoptions", "kycrequests", "assets",
  ];
  for (const name of names) {
    try {
      await db.createCollection(name);
    } catch (error) {
      if (error && error.codeName !== "NamespaceExists") throw error;
    }
  }

  const adminId = new mongoose.Types.ObjectId();
  const referrerId = new mongoose.Types.ObjectId();
  const userId = new mongoose.Types.ObjectId();
  const createdAt = new Date();

  await db.collection("users").insertMany([
    {
      _id: adminId, name: "CI Admin", username: "ci_admin",
      email: "ci-admin@arabtrade.invalid", password: "unused",
      role: "admin_leader", referralCode: "CIADMIN", referredBy: null,
      isVerified: true, isActive: true, createdAt, updatedAt: createdAt,
    },
    {
      _id: referrerId, name: "CI Referrer", username: "ci_referrer",
      email: "ci-referrer@arabtrade.invalid", password: "unused",
      role: "user", referralCode: "CIREFERRER", referredBy: null,
      isVerified: true, isActive: true, createdAt, updatedAt: createdAt,
    },
    {
      _id: userId, name: "CI User", username: "ci_user",
      email: "ci-user@arabtrade.invalid", password: "unused",
      role: "user", referralCode: "CIUSER", referredBy: referrerId,
      isVerified: true, isActive: true, createdAt, updatedAt: createdAt,
    },
  ]);

  await db.collection("platformsettings").insertOne({
    key: "global",
    platform: {
      maintenanceMode: false, registrationEnabled: true, loginEnabled: true,
      emailVerificationRequired: false, defaultDisplayCurrency: "USDT",
      defaultLanguage: "ar", timezone: "Africa/Cairo",
    },
    deposits: { enabled: true, minAmount: 1, maxAmount: 100000, autoConfirm: false },
    withdrawals: {
      enabled: true, minAmount: 1, maxAmount: 100000, dailyLimit: 100000,
      requireEmailVerification: false, requireTwoFactor: false, manualReview: true,
    },
    trading: {
      enabled: true, spotEnabled: true, marginEnabled: false, futuresEnabled: false,
      defaultFeePercent: 0, liquidationFeePercent: 0, marginInterestRatePercent: 0,
      minOrderAmount: 1, maxOrderAmount: 100000,
    },
    referral: { enabled: true, commissionPercent: 10, minPayout: 0 },
    rewards: { enabled: true },
    notifications: { enabled: true, emailEnabled: false },
    support: { email: "ci@arabtrade.invalid", facebook: "", telegram: "" },
    security: { sessionDays: 7, maxLoginAttempts: 5, lockoutMinutes: 15 },
    createdAt, updatedAt: createdAt,
  });

  await db.collection("paymentoptions").insertOne({
    name: "CI Test Network", asset: "USDT", network: "TRC20",
    address: "test-deposit-address", minDeposit: 1, minWithdrawal: 1,
    enabled: true, depositEnabled: true, withdrawalEnabled: true,
    createdAt, updatedAt: createdAt,
  });

  await db.collection("depositrequests").insertOne({
    userId, asset: "USDT", network: "TRC20", amount: 1000,
    txHash: "ci-unique-transaction-hash", confirmations: 0,
    creditedAt: null, confirmedAt: null, address: "test-deposit-address",
    status: "pending", adminNote: "", screenshotPath: "",
    createdAt, updatedAt: createdAt,
  });

  await db.collection("kycrequests").insertOne({
    userId, fullName: "CI User", dateOfBirth: "1990-01-01",
    nationality: "Egyptian", documentType: "national_id",
    documentNumber: "CI-KYC-0001", issuingCountry: "Egypt",
    documentPath: "ci-document", selfiePath: "ci-selfie",
    status: "approved", createdAt, updatedAt: createdAt,
  });

  await db.collection("wallets").insertOne({
    userId, type: "spot", mode: "live",
    balances: [{ asset: "USDT", available: 50, locked: 0 }],
    createdAt, updatedAt: createdAt,
  });

  console.log("PASS: seeded isolated arabtrade_test database");
}

async function token(userId) {
  return new SignJWT({ userId: String(userId) })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime("20m")
    .sign(new TextEncoder().encode(secretText));
}

async function api(path, options = {}) {
  const actor = options.as || "user";
  const userRecord = await db.collection("users").findOne({
    email: actor === "admin" ? "ci-admin@arabtrade.invalid" :
      actor === "referrer" ? "ci-referrer@arabtrade.invalid" : "ci-user@arabtrade.invalid",
  });
  assert.ok(userRecord, "test user is missing for actor " + actor);
  const headers = { cookie: "arabtrade_session=" + await token(userRecord._id) };
  let requestBody;
  if (options.body instanceof FormData) {
    requestBody = options.body;
  } else if (options.body !== undefined) {
    headers["content-type"] = "application/json";
    requestBody = JSON.stringify(options.body);
  }

  const response = await fetch(baseUrl + path, {
    method: options.method || "GET",
    headers,
    body: requestBody,
    redirect: "manual",
  });
  const raw = await response.text();
  let data;
  try {
    data = JSON.parse(raw);
  } catch {
    throw new Error((options.method || "GET") + " " + path + " returned non-JSON HTTP " + response.status + ": " + raw.slice(0, 400));
  }
  return { status: response.status, data };
}

function statusIs(result, expected, label) {
  assert.ok(
    Array.isArray(expected) ? expected.includes(result.status) : result.status === expected,
    label + ": expected HTTP " + expected + ", got " + result.status + "; body=" + JSON.stringify(result.data)
  );
}
function ok(result, label, expectedStatus = 200) {
  statusIs(result, expectedStatus, label);
  assert.equal(result.data.success, true, label + ": " + JSON.stringify(result.data));
}
function closeTo(actual, expected, label) {
  assert.ok(Number.isFinite(Number(actual)) && Math.abs(Number(actual) - expected) < 1e-7,
    label + ": expected " + expected + ", got " + actual);
}

if (mode === "prepare") {
  try {
    await prepare();
  } finally {
    await mongoose.disconnect();
  }
  process.exit(0);
}

const admin = await db.collection("users").findOne({ email: "ci-admin@arabtrade.invalid" });
const referrer = await db.collection("users").findOne({ email: "ci-referrer@arabtrade.invalid" });
const user = await db.collection("users").findOne({ email: "ci-user@arabtrade.invalid" });
assert.ok(admin && referrer && user, "run test preparation first");
const deposit = await db.collection("depositrequests").findOne({ txHash: "ci-unique-transaction-hash" });
const payment = await db.collection("paymentoptions").findOne({ asset: "USDT", network: "TRC20" });
assert.ok(deposit && payment, "CI deposit/payment fixtures must exist");

ok(await api("/api/admin/deposits", {
  as: "admin", method: "PATCH",
  body: { id: String(deposit._id), status: "approved", adminNote: "CI external deposit" },
}), "admin approves external deposit");

let spotWallet = await db.collection("wallets").findOne({ userId: user._id, type: "spot", mode: "live" });
let depositBalance = await db.collection("depositbalances").findOne({ userId: user._id, asset: "USDT" });
closeTo(spotWallet && spotWallet.balances.find((x) => x.asset === "USDT").available, 50, "approved deposit does not increase the general spot balance");
closeTo(spotWallet && spotWallet.balances.find((x) => x.asset === "USDT").locked, 0, "approved deposit does not lock general wallet funds");
closeTo(depositBalance && depositBalance.available, 1000, "approved deposit is stored in the separate deposit balance");
closeTo(depositBalance && depositBalance.locked, 0, "new deposit balance is not locked");
const referrerWallet = await db.collection("wallets").findOne({ userId: referrer._id, type: "spot", mode: "live" });
closeTo(referrerWallet && referrerWallet.balances.find((x) => x.asset === "USDT").available, 100, "referral commission is in general withdrawal wallet");
const referralCommission = await db.collection("referralcommissions").findOne({ referrerId: referrer._id, referredUserId: user._id });
closeTo(referralCommission && referralCommission.amount, 100, "referral commission recorded");

const duplicateApproval = await api("/api/admin/deposits", {
  as: "admin", method: "PATCH",
  body: { id: String(deposit._id), status: "approved", adminNote: "duplicate attempt" },
});
statusIs(duplicateApproval, 409, "duplicate deposit approval blocked");
spotWallet = await db.collection("wallets").findOne({ userId: user._id, type: "spot", mode: "live" });
depositBalance = await db.collection("depositbalances").findOne({ userId: user._id, asset: "USDT" });
closeTo(spotWallet && spotWallet.balances.find((x) => x.asset === "USDT").available, 50, "duplicate approval leaves general balance unchanged");
closeTo(depositBalance && depositBalance.available, 1000, "duplicate approval does not double credit deposit balance");

statusIs(await api("/api/withdrawals", {
  method: "POST",
  body: { asset: "USDT", network: "TEST", address: "user-test-address", amount: 1000, source: "wallet" },
}), 400, "unsupported network is rejected before any USDT debit");
spotWallet = await db.collection("wallets").findOne({ userId: user._id, type: "spot", mode: "live" });
closeTo(spotWallet.balances.find((x) => x.asset === "USDT").available, 50, "unsupported network leaves general balance unchanged");

statusIs(await api("/api/withdrawals", {
  method: "POST",
  body: { asset: "USDT", network: "TRC20", address: "user-test-address", amount: 1000, source: "wallet" },
}), 400, "general withdrawal is limited to the general wallet");
spotWallet = await db.collection("wallets").findOne({ userId: user._id, type: "spot", mode: "live" });
depositBalance = await db.collection("depositbalances").findOne({ userId: user._id, asset: "USDT" });
closeTo(spotWallet.balances.find((x) => x.asset === "USDT").available, 50, "failed withdrawal preserves general wallet funds");
closeTo(depositBalance && depositBalance.available, 1000, "failed withdrawal leaves deposit balance untouched");

const userReferral = await api("/api/referral", { as: "referrer" });
ok(userReferral, "user referral API");
assert.equal(userReferral.data.referral.active, 1, "user sees one active referral");
closeTo(userReferral.data.referral.referrals[0].depositsByAsset.find((x) => x.asset === "USDT").amount, 1000, "user sees approved referral deposit");

const adminReferral = await api("/api/admin/referral", { as: "admin" });
ok(adminReferral, "admin referral API");
const adminReferralRow = adminReferral.data.referrals.find((x) => x.email === user.email);
assert.equal(adminReferralRow.active, true, "admin sees active referral");
closeTo(adminReferralRow.depositsByAsset.find((x) => x.asset === "USDT").amount, 1000, "admin sees referral deposit amount");

const plan100Result = await api("/api/admin/packages", {
  as: "admin", method: "POST",
  body: { name: "CI package 100", description: "financial test", price: 100, durationDays: 30, enabled: true },
});
ok(plan100Result, "admin creates package 100", 201);
const plan200Result = await api("/api/admin/packages", {
  as: "admin", method: "POST",
  body: { name: "CI package 200", description: "financial test", price: 200, durationDays: 30, enabled: true },
});
ok(plan200Result, "admin creates package 200", 201);
const plan100 = plan100Result.data.package;
const plan200 = plan200Result.data.package;
assert.ok(plan100 && plan200, "admin-created packages need IDs");

const packagePage = await api("/api/packages");
ok(packagePage, "user packages API");
closeTo(packagePage.data.depositBalances.find((x) => x.asset === "USDT").available, 1000, "package page reads the separate deposit balance");

const activated = await api("/api/packages", { method: "POST", body: { action: "activate", packageId: String(plan100._id) } });
ok(activated, "user activates package from separate deposit balance", 201);
const package100 = activated.data.userPackage;
spotWallet = await db.collection("wallets").findOne({ userId: user._id, type: "spot", mode: "live" });
depositBalance = await db.collection("depositbalances").findOne({ userId: user._id, asset: "USDT" });
closeTo(spotWallet.balances.find((x) => x.asset === "USDT").available, 50, "package activation does not debit the general spot balance");
closeTo(depositBalance && depositBalance.available, 900, "package activation debits the separate deposit balance");
closeTo(Number(package100.availableEarnings || 0), 100, "package activation principal is withdrawable within the first-stage cap");

ok(await api("/api/admin/packages/credit", {
  as: "admin", method: "POST",
  body: { userPackageId: String(package100._id), amount: 600, note: "CI realized proceeds test credit" },
}), "admin credits realized earnings to package");
let package100Doc = await db.collection("userpackages").findOne({ _id: new mongoose.Types.ObjectId(String(package100._id)) });
closeTo(package100Doc.availableEarnings, 700, "withdrawable activation principal plus realized earnings stay in package withdrawal bucket");

const tooLargeFirst = await api("/api/withdrawals", {
  method: "POST",
  body: { asset: "USDT", network: "TRC20", address: "user-test-address", amount: 101, source: "package", userPackageId: String(package100._id) },
});
statusIs(tooLargeFirst, 400, "first package withdrawal cannot exceed activation price");
package100Doc = await db.collection("userpackages").findOne({ _id: new mongoose.Types.ObjectId(String(package100._id)) });
closeTo(package100Doc.availableEarnings, 700, "rejected over-limit first withdrawal preserves bucket");

const firstWithdrawal = await api("/api/withdrawals", {
  method: "POST",
  body: { asset: "USDT", network: "TRC20", address: "user-test-address", amount: 100, source: "package", userPackageId: String(package100._id) },
});
ok(firstWithdrawal, "first package withdrawal in activation limit", 201);
const rejectedPackageWithdrawalId = String(firstWithdrawal.data.withdrawal._id);
package100Doc = await db.collection("userpackages").findOne({ _id: new mongoose.Types.ObjectId(String(package100._id)) });
closeTo(package100Doc.availableEarnings, 600, "package available earnings decrease by the requested amount while pending");
closeTo(package100Doc.lockedEarnings, 100, "package withdrawal reserved as locked");
assert.equal(package100Doc.firstWithdrawalStatus, "pending", "first package withdrawal marked pending");

statusIs(await api("/api/packages", {
  method: "POST",
  body: { action: "cancel", userPackageId: String(package100._id) },
}), 409, "package cancellation is blocked while package funds are locked");
const stillActivePackage = await db.collection("userpackages").findOne({ _id: new mongoose.Types.ObjectId(String(package100._id)) });
assert.equal(stillActivePackage.status, "active", "blocked cancellation leaves package active");
closeTo(stillActivePackage.cancellationRefund, 0, "blocked cancellation does not book a refund");

statusIs(await api("/api/withdrawals", {
  method: "POST",
  body: { asset: "USDT", network: "TRC20", address: "user-test-address", amount: 10, source: "package", userPackageId: String(package100._id) },
}), 409, "another package withdrawal is blocked while the first is unresolved");

ok(await api("/api/admin/withdrawals", {
  as: "admin", method: "PATCH",
  body: { id: rejectedPackageWithdrawalId, status: "rejected", adminNote: "CI verify package balance restoration" },
}), "admin rejects package withdrawal");
package100Doc = await db.collection("userpackages").findOne({ _id: new mongoose.Types.ObjectId(String(package100._id)) });
closeTo(package100Doc.availableEarnings, 700, "rejected package withdrawal restores available earnings");
closeTo(package100Doc.lockedEarnings, 0, "rejected package withdrawal unlocks funds");
assert.equal(package100Doc.firstWithdrawalStatus, "available", "rejected first package withdrawal can be retried");

const retryFirstWithdrawal = await api("/api/withdrawals", {
  method: "POST",
  body: { asset: "USDT", network: "TRC20", address: "user-test-address", amount: 100, source: "package", userPackageId: String(package100._id) },
});
ok(retryFirstWithdrawal, "first package withdrawal can be retried after rejection", 201);
const packageWithdrawalId = String(retryFirstWithdrawal.data.withdrawal._id);
package100Doc = await db.collection("userpackages").findOne({ _id: new mongoose.Types.ObjectId(String(package100._id)) });
closeTo(package100Doc.availableEarnings, 600, "retried package withdrawal decreases available earnings");
closeTo(package100Doc.lockedEarnings, 100, "retried package withdrawal locks funds again");
assert.equal(package100Doc.firstWithdrawalStatus, "pending", "retried first package withdrawal marked pending");

statusIs(await api("/api/withdrawals", {
  method: "POST",
  body: { asset: "USDT", network: "TRC20", address: "user-test-address", amount: 10, source: "package", userPackageId: String(package100._id) },
}), 409, "second package withdrawal blocked while first request is pending");

ok(await api("/api/admin/withdrawals", {
  as: "admin", method: "PATCH",
  body: { id: packageWithdrawalId, status: "approved", adminNote: "CI approval" },
}), "admin approves package withdrawal");
ok(await api("/api/admin/withdrawals", {
  as: "admin", method: "PATCH",
  body: { id: packageWithdrawalId, status: "completed", adminNote: "CI completed payout" },
}), "admin completes package withdrawal");
package100Doc = await db.collection("userpackages").findOne({ _id: new mongoose.Types.ObjectId(String(package100._id)) });
closeTo(package100Doc.availableEarnings, 600, "remaining package principal and earnings after completed withdrawal");
closeTo(package100Doc.lockedEarnings, 0, "completed package withdrawal unlocks reserved amount");
closeTo(package100Doc.totalWithdrawn, 100, "package withdrawal total");
assert.equal(package100Doc.firstWithdrawalStatus, "completed", "first package withdrawal marked completed");

const missingReferralCapacity = await api("/api/withdrawals", {
  method: "POST",
  body: { asset: "USDT", network: "TRC20", address: "user-test-address", amount: 1, source: "package", userPackageId: String(package100._id) },
});
statusIs(missingReferralCapacity, 400, "phase-two package withdrawal is blocked when no active referrals exist");
assert.match(String(missingReferralCapacity.data.message || ""), /الطاقة منخفضة الآن، يُرجى جلب إحالات نشطة/, "empty phase two asks the user to bring active referrals");

const siblingPackageAccountId = new mongoose.Types.ObjectId();
await db.collection("userpackages").insertOne({
  _id: siblingPackageAccountId,
  userId: user._id,
  packageId: plan100._id,
  packageName: package100.packageName,
  investedAmount: 100,
  asset: "USDT",
  durationDays: 0,
  status: "cancelled",
  availableEarnings: 100,
  lockedEarnings: 0,
  totalRealizedEarnings: 0,
  totalWithdrawn: 0,
  withdrawablePrincipalCredited: true,
  firstWithdrawalStatus: "available",
  cancellationRefund: 0,
  activatedAt: new Date(),
  createdAt: new Date(),
  updatedAt: new Date(),
});
const siblingFirstStageBypass = await api("/api/withdrawals", {
  method: "POST",
  body: { asset: "USDT", network: "TRC20", address: "user-test-address", amount: 50, source: "package", userPackageId: String(siblingPackageAccountId) },
});
statusIs(siblingFirstStageBypass, 400, "another account with the same package name cannot reopen the first-stage allowance");
assert.match(String(siblingFirstStageBypass.data.message || ""), /الطاقة منخفضة الآن، يُرجى جلب إحالات نشطة/, "same-name duplicate account follows the referral phase");

const capTestReferralId = new mongoose.Types.ObjectId();
const capTestCreatedAt = new Date();
await db.collection("users").insertOne({
  _id: capTestReferralId,
  name: "CI Package Cap Referral",
  username: "ci_package_cap_referral",
  email: "ci-package-cap-referral@arabtrade.invalid",
  password: "unused",
  role: "user",
  referralCode: "CIPACKAGECAPREF",
  referredBy: user._id,
  isVerified: true,
  isActive: true,
  createdAt: capTestCreatedAt,
  updatedAt: capTestCreatedAt,
});
await db.collection("depositrequests").insertOne({
  _id: new mongoose.Types.ObjectId(),
  userId: capTestReferralId,
  asset: "USDT",
  amount: 100,
  status: "approved",
  createdAt: capTestCreatedAt,
  updatedAt: capTestCreatedAt,
});
const cappedPackagePage = await api("/api/packages");
ok(cappedPackagePage, "package page calculates phase-two referral capacity");
const cappedPackageAccount = cappedPackagePage.data.userPackages.find((x) => String(x._id) === String(package100._id));
assert.ok(cappedPackageAccount, "capped package account is visible");
closeTo(cappedPackageAccount.packageWithdrawalUsed, 100, "completed first-stage withdrawal counts toward the package principal amount");
closeTo(cappedPackageAccount.withdrawalLimit, 50, "100 USDT of active referral deposits unlocks exactly 50 USDT after the first stage");

const overReferralCap = await api("/api/withdrawals", {
  method: "POST",
  body: { asset: "USDT", network: "TRC20", address: "user-test-address", amount: 51, source: "package", userPackageId: String(package100._id) },
});
statusIs(overReferralCap, 400, "phase-two withdrawal cannot exceed half of the active referral deposits");
assert.match(String(overReferralCap.data.message || ""), /المتاح للسحب مقابل الإحالات النشطة/, "over-cap referral withdrawal explains the remaining referral allowance");

const secondStageWithdrawal = await api("/api/withdrawals", {
  method: "POST",
  body: { asset: "USDT", network: "TRC20", address: "user-test-address", amount: 50, source: "package", userPackageId: String(package100._id) },
});
ok(secondStageWithdrawal, "user can withdraw 50 USDT against a 100-USDT active referral deposit", 201);
const secondStageWithdrawalId = String(secondStageWithdrawal.data.withdrawal._id);
package100Doc = await db.collection("userpackages").findOne({ _id: new mongoose.Types.ObjectId(String(package100._id)) });
closeTo(package100Doc.availableEarnings, 550, "second-stage withdrawal reduces the package's available bucket");
closeTo(package100Doc.lockedEarnings, 50, "second-stage withdrawal locks its requested amount");

ok(await api("/api/admin/withdrawals", {
  as: "admin", method: "PATCH",
  body: { id: secondStageWithdrawalId, status: "approved", adminNote: "CI approval within active referral cap" },
}), "admin approves phase-two referral-cap withdrawal");
ok(await api("/api/admin/withdrawals", {
  as: "admin", method: "PATCH",
  body: { id: secondStageWithdrawalId, status: "completed", adminNote: "CI completes phase-two referral-cap withdrawal" },
}), "admin completes phase-two referral-cap withdrawal");

const afterReferralAllowanceUsed = await api("/api/packages");
ok(afterReferralAllowanceUsed, "package API refreshes referral allowance after payout");
const afterReferralAccount = afterReferralAllowanceUsed.data.userPackages.find((x) => String(x._id) === String(package100._id));
closeTo(afterReferralAccount.withdrawalLimit, 0, "used referral allowance cannot be withdrawn a second time");

const legacyOverCapRequestId = new mongoose.Types.ObjectId();
const legacyOverCapCreatedAt = new Date(Date.now() + 1000);
await db.collection("withdrawalrequests").insertOne({
  _id: legacyOverCapRequestId,
  userId: user._id,
  asset: "USDT",
  network: "TRC20",
  amount: 1,
  fee: 0,
  receiveAmount: 1,
  address: "legacy-over-cap-test-address",
  source: "package",
  walletType: "spot",
  walletAllocations: [],
  userPackageId: new mongoose.Types.ObjectId(String(package100._id)),
  isFirstPackageWithdrawal: false,
  status: "pending",
  adminNote: "",
  createdAt: legacyOverCapCreatedAt,
  updatedAt: legacyOverCapCreatedAt,
});
const blockedLegacyApproval = await api("/api/admin/withdrawals", {
  as: "admin",
  method: "PATCH",
  body: { id: String(legacyOverCapRequestId), status: "approved", adminNote: "CI ensure legacy request cannot exceed active referral allowance" },
});
statusIs(blockedLegacyApproval, 409, "admin cannot approve a legacy second-stage request beyond the active referral cap");
await db.collection("withdrawalrequests").deleteOne({ _id: legacyOverCapRequestId });

// Legacy accounts must not receive the same package principal twice when an older withdrawal
// predates the isFirstPackageWithdrawal marker.
const legacyPackageId = new mongoose.Types.ObjectId();
const legacyPackageCreatedAt = new Date(Date.now() - 5000);
await db.collection("userpackages").insertOne({
  _id: legacyPackageId,
  userId: user._id,
  packageId: plan200._id,
  packageName: "CI legacy 500 package",
  investedAmount: 500,
  asset: "USDT",
  durationDays: 30,
  status: "cancelled",
  availableEarnings: 0,
  lockedEarnings: 0,
  totalRealizedEarnings: 0,
  totalWithdrawn: 500,
  firstWithdrawalStatus: "completed",
  withdrawalRequestPending: false,
  cancellationRefund: 0,
  activatedAt: legacyPackageCreatedAt,
  lastProfitAt: legacyPackageCreatedAt,
  createdAt: legacyPackageCreatedAt,
  updatedAt: legacyPackageCreatedAt,
});
const legacyPrincipalWithdrawalId = new mongoose.Types.ObjectId();
await db.collection("withdrawalrequests").insertOne({
  _id: legacyPrincipalWithdrawalId,
  userId: user._id,
  asset: "USDT",
  network: "TRC20",
  amount: 500,
  fee: 0,
  receiveAmount: 500,
  address: "legacy-package-withdrawal-address",
  source: "package",
  walletType: "spot",
  walletAllocations: [],
  userPackageId: legacyPackageId,
  isFirstPackageWithdrawal: false,
  status: "completed",
  adminNote: "",
  createdAt: legacyPackageCreatedAt,
  updatedAt: legacyPackageCreatedAt,
});
const migratedLegacyPage = await api("/api/packages");
ok(migratedLegacyPage, "legacy package migration does not re-credit a completed withdrawal");
const migratedLegacyAccount = migratedLegacyPage.data.userPackages.find((x) => String(x._id) === String(legacyPackageId));
assert.ok(migratedLegacyAccount, "legacy package account remains visible");
closeTo(migratedLegacyAccount.availableEarnings, 0, "legacy 500-USDT withdrawal does not restore another 500 to the card balance");
closeTo(migratedLegacyAccount.firstPackageWithdrawalRemaining, 0, "legacy withdrawal consumes the first-stage package allowance");
assert.equal((await db.collection("userpackages").findOne({ _id: legacyPackageId })).withdrawablePrincipalCredited, true, "legacy principal migration is marked once");
assert.equal((await db.collection("withdrawalrequests").findOne({ _id: legacyPrincipalWithdrawalId })).isFirstPackageWithdrawal, true, "legacy withdrawal is classified against the package principal cap");
const migratedLegacyPageAgain = await api("/api/packages");
ok(migratedLegacyPageAgain, "reloading package balances keeps the legacy migration idempotent");
closeTo(migratedLegacyPageAgain.data.userPackages.find((x) => String(x._id) === String(legacyPackageId)).availableEarnings, 0, "reloading does not put the withdrawn 500 back");

// Repair an account already marked migrated by the previous buggy helper: it credited
// 500 again even though a 500-USDT legacy withdrawal was already completed.
const previouslyMigratedPackageId = new mongoose.Types.ObjectId();
const previouslyMigratedCreatedAt = new Date(Date.now() - 4000);
await db.collection("userpackages").insertOne({
  _id: previouslyMigratedPackageId,
  userId: user._id,
  packageId: plan200._id,
  packageName: "CI previously-migrated 500 package",
  investedAmount: 500,
  asset: "USDT",
  durationDays: 30,
  status: "cancelled",
  availableEarnings: 500,
  lockedEarnings: 0,
  totalRealizedEarnings: 0,
  totalWithdrawn: 500,
  withdrawablePrincipalCredited: true,
  firstWithdrawalStatus: "completed",
  withdrawalRequestPending: false,
  cancellationRefund: 0,
  activatedAt: previouslyMigratedCreatedAt,
  lastProfitAt: previouslyMigratedCreatedAt,
  createdAt: previouslyMigratedCreatedAt,
  updatedAt: previouslyMigratedCreatedAt,
});
const previouslyMigratedWithdrawalId = new mongoose.Types.ObjectId();
await db.collection("withdrawalrequests").insertOne({
  _id: previouslyMigratedWithdrawalId,
  userId: user._id,
  asset: "USDT",
  network: "TRC20",
  amount: 500,
  fee: 0,
  receiveAmount: 500,
  address: "previously-migrated-withdrawal-address",
  source: "package",
  walletType: "spot",
  walletAllocations: [],
  userPackageId: previouslyMigratedPackageId,
  isFirstPackageWithdrawal: false,
  status: "completed",
  adminNote: "",
  createdAt: previouslyMigratedCreatedAt,
  updatedAt: previouslyMigratedCreatedAt,
});
await db.collection("packageledgers").insertOne({
  userId: user._id,
  userPackageId: previouslyMigratedPackageId,
  type: "activation_withdrawable",
  asset: "USDT",
  amount: 500,
  note: "إتاحة المتبقي من قيمة تفعيل الباقة ضمن حد السحب الأول.",
  createdAt: previouslyMigratedCreatedAt,
});
const repairedLegacyPage = await api("/api/packages");
ok(repairedLegacyPage, "previously migrated legacy account is repaired");
const repairedLegacyAccount = repairedLegacyPage.data.userPackages.find((x) => String(x._id) === String(previouslyMigratedPackageId));
assert.ok(repairedLegacyAccount, "previously migrated account is visible after repair");
closeTo(repairedLegacyAccount.availableEarnings, 0, "old duplicate principal top-up is removed from the visible package balance");
closeTo(repairedLegacyAccount.firstPackageWithdrawalRemaining, 0, "old 500 withdrawal consumes the first-stage allowance after repair");
assert.equal((await db.collection("withdrawalrequests").findOne({ _id: previouslyMigratedWithdrawalId })).isFirstPackageWithdrawal, true, "old completed withdrawal is classified on an already-migrated account");

// One open withdrawal per package: a 300-USDT package has 200 left after a 100-USDT request,
// but a second request remains blocked until the first is rejected or completed.
const singleRequestPackageId = new mongoose.Types.ObjectId();
const singleRequestPackageCreatedAt = new Date();
await db.collection("userpackages").insertOne({
  _id: singleRequestPackageId,
  userId: user._id,
  packageId: plan200._id,
  packageName: "CI package 300 one-open-request",
  investedAmount: 300,
  asset: "USDT",
  durationDays: 30,
  status: "cancelled",
  availableEarnings: 300,
  lockedEarnings: 0,
  totalRealizedEarnings: 300,
  totalWithdrawn: 0,
  withdrawablePrincipalCredited: true,
  firstWithdrawalStatus: "available",
  withdrawalRequestPending: false,
  cancellationRefund: 0,
  activatedAt: singleRequestPackageCreatedAt,
  lastProfitAt: singleRequestPackageCreatedAt,
  createdAt: singleRequestPackageCreatedAt,
  updatedAt: singleRequestPackageCreatedAt,
});
const firstSingleRequest = await api("/api/withdrawals", {
  method: "POST",
  body: { asset: "USDT", network: "TRC20", address: "single-request-test-address", amount: 100, source: "package", userPackageId: String(singleRequestPackageId) },
});
ok(firstSingleRequest, "first 100-USDT withdrawal from a 300-USDT package is accepted", 201);
const firstSingleRequestId = String(firstSingleRequest.data.withdrawal._id);
let singleRequestPackage = await db.collection("userpackages").findOne({ _id: singleRequestPackageId });
closeTo(singleRequestPackage.availableEarnings, 200, "300-USDT package still has 200 available after first 100-USDT request");
assert.equal(singleRequestPackage.withdrawalRequestPending, true, "package account locks while the first withdrawal is unresolved");
const singleRequestPackagesPage = await api("/api/packages");
ok(singleRequestPackagesPage, "package API exposes single-request lock");
const singleRequestPackageView = singleRequestPackagesPage.data.userPackages.find((x) => String(x._id) === String(singleRequestPackageId));
assert.equal(singleRequestPackageView.packageWithdrawalPending, true, "package API marks unresolved package withdrawal");
closeTo(singleRequestPackageView.packageWithdrawalRemaining, 200, "package cap still has 200 remaining while first request is pending");
closeTo(singleRequestPackageView.withdrawalLimit, 0, "package API prevents a second withdrawal despite remaining balance and cap");
const secondSingleRequest = await api("/api/withdrawals", {
  method: "POST",
  body: { asset: "USDT", network: "TRC20", address: "single-request-test-address", amount: 100, source: "package", userPackageId: String(singleRequestPackageId) },
});
statusIs(secondSingleRequest, 409, "second 100-USDT request is blocked while the first request is unresolved");
assert.match(String(secondSingleRequest.data.message || ""), /طلب سحب قائم/, "second request explains that an unresolved withdrawal already exists");
ok(await api("/api/admin/withdrawals", {
  as: "admin",
  method: "PATCH",
  body: { id: firstSingleRequestId, status: "approved", adminNote: "CI review decision releases one-open-pending lock" },
}), "admin approval releases the review lock");
singleRequestPackage = await db.collection("userpackages").findOne({ _id: singleRequestPackageId });
assert.equal(singleRequestPackage.withdrawalRequestPending, false, "package request lock clears after approval");
const blockedWhileTransferInProgress = await api("/api/withdrawals", {
  method: "POST",
  body: { asset: "USDT", network: "TRC20", address: "single-request-test-address", amount: 100, source: "package", userPackageId: String(singleRequestPackageId) },
});
statusIs(blockedWhileTransferInProgress, 409, "no new package withdrawal while the approved transfer is still in progress");
assert.match(String(blockedWhileTransferInProgress.data.message || ""), /لا يُسمح بطلب جديد حتى يكتمل التحويل/, "in-progress withdrawal lock explains why the next request must wait");
ok(await api("/api/admin/withdrawals", {
  as: "admin",
  method: "PATCH",
  body: { id: firstSingleRequestId, status: "completed", adminNote: "CI complete the first-stage payout before testing the referral stage" },
}), "admin completes the first-stage withdrawal");
singleRequestPackage = await db.collection("userpackages").findOne({ _id: singleRequestPackageId });
closeTo(singleRequestPackage.availableEarnings, 200, "completed first-stage withdrawal leaves the remaining package balance");
closeTo(singleRequestPackage.lockedEarnings, 0, "completed first-stage withdrawal releases its locked amount");
const approvedWithdrawalPackagesPage = await api("/api/packages");
ok(approvedWithdrawalPackagesPage, "package API exposes the post-approval withdrawal phase");
const approvedWithdrawalPackageView = approvedWithdrawalPackagesPage.data.userPackages.find((x) => String(x._id) === String(singleRequestPackageId));
assert.equal(approvedWithdrawalPackageView.packageWithdrawalAlreadyUsed, true, "package API marks a successful first-stage withdrawal");
closeTo(approvedWithdrawalPackageView.firstPackageWithdrawalRemaining, 200, "first-stage principal remains visible after a partial first request");
closeTo(approvedWithdrawalPackageView.withdrawalLimit, 0, "later withdrawal limit is referral-based when the available referral capacity has already been used");
const blockedSecondStageWithoutCapacity = await api("/api/withdrawals", {
  method: "POST",
  body: { asset: "USDT", network: "TRC20", address: "single-request-test-address", amount: 100, source: "package", userPackageId: String(singleRequestPackageId) },
});
statusIs(blockedSecondStageWithoutCapacity, 400, "later package withdrawal requires referral capacity after the first approval");
assert.match(String(blockedSecondStageWithoutCapacity.data.message || ""), /المتاح للسحب مقابل الإحالات النشطة/, "second-stage rejection explains the active-referral limit");

const laterStageReferralId = new mongoose.Types.ObjectId();
const laterStageReferralCreatedAt = new Date();
await db.collection("users").insertOne({
  _id: laterStageReferralId,
  name: "CI Later Stage Referral",
  username: "ci_later_stage_referral",
  email: "ci-later-stage-referral@arabtrade.invalid",
  password: "unused",
  role: "user",
  referralCode: "CILATERSTAGEREF",
  referredBy: user._id,
  isVerified: true,
  isActive: true,
  createdAt: laterStageReferralCreatedAt,
  updatedAt: laterStageReferralCreatedAt,
});
await db.collection("depositrequests").insertOne({
  _id: new mongoose.Types.ObjectId(),
  userId: laterStageReferralId,
  asset: "USDT",
  amount: 200,
  status: "approved",
  createdAt: laterStageReferralCreatedAt,
  updatedAt: laterStageReferralCreatedAt,
});
const referralUnlockedPackagesPage = await api("/api/packages");
ok(referralUnlockedPackagesPage, "package API refreshes the later-stage referral allowance");
const referralUnlockedPackageView = referralUnlockedPackagesPage.data.userPackages.find((x) => String(x._id) === String(singleRequestPackageId));
closeTo(referralUnlockedPackageView.withdrawalLimit, 100, "additional active referral deposits unlock the configured 50-percent second-stage amount");

const laterStageWithdrawal = await api("/api/withdrawals", {
  method: "POST",
  body: { asset: "USDT", network: "TRC20", address: "single-request-test-address", amount: 100, source: "package", userPackageId: String(singleRequestPackageId) },
});
ok(laterStageWithdrawal, "later package withdrawal is allowed within the active-referral cap after first approval", 201);
assert.equal(laterStageWithdrawal.data.withdrawal.isFirstPackageWithdrawal, false, "later package withdrawal is classified as referral-based");
const laterStageWithdrawalId = String(laterStageWithdrawal.data.withdrawal._id);
ok(await api("/api/admin/withdrawals", {
  as: "admin",
  method: "PATCH",
  body: { id: laterStageWithdrawalId, status: "approved", adminNote: "CI approval within the active-referral cap" },
}), "admin approves later-stage withdrawal within referral capacity");
ok(await api("/api/admin/withdrawals", {
  as: "admin",
  method: "PATCH",
  body: { id: laterStageWithdrawalId, status: "completed", adminNote: "CI complete later-stage referral withdrawal" },
}), "admin completes later-stage referral withdrawal");

const generalWithdrawal = await api("/api/withdrawals", {
  method: "POST",
  body: { asset: "USDT", network: "TRC20", address: "general-test-address", amount: 10, source: "wallet" },
});
ok(generalWithdrawal, "user requests general-wallet withdrawal", 201);
const generalWithdrawalId = String(generalWithdrawal.data.withdrawal._id);
let userWallet = await db.collection("wallets").findOne({ userId: user._id, type: "spot", mode: "live" });
closeTo(userWallet.balances.find((x) => x.asset === "USDT").available, 40, "general withdrawal reduces general spot balance only");
closeTo(userWallet.balances.find((x) => x.asset === "USDT").locked, 10, "general withdrawal locks request amount");
ok(await api("/api/admin/withdrawals", {
  as: "admin", method: "PATCH",
  body: { id: generalWithdrawalId, status: "rejected", adminNote: "CI balance restoration" },
}), "admin rejects general-wallet withdrawal");
userWallet = await db.collection("wallets").findOne({ userId: user._id, type: "spot", mode: "live" });
closeTo(userWallet.balances.find((x) => x.asset === "USDT").available, 50, "rejected withdrawal restores general spot balance");
closeTo(userWallet.balances.find((x) => x.asset === "USDT").locked, 0, "rejected withdrawal releases locked balance");

const changed = await api("/api/packages", {
  method: "POST",
  body: { action: "change", packageId: String(plan200._id), userPackageId: String(package100._id) },
});
ok(changed, "atomic package change");
const package200 = changed.data.userPackage;
assert.ok(package200 && package200._id, "new package account created");
const oldPackage = await db.collection("userpackages").findOne({ _id: new mongoose.Types.ObjectId(String(package100._id)) });
assert.equal(oldPackage.status, "cancelled", "old package is cancelled");
closeTo(oldPackage.cancellationRefund, 50, "changing package refunds half old activation");
userWallet = await db.collection("wallets").findOne({ userId: user._id, type: "spot", mode: "live" });
closeTo(userWallet.balances.find((x) => x.asset === "USDT").available, 50, "package change does not mix deposit or package refund into the general wallet");
const oldPackageAfterChange = await db.collection("userpackages").findOne({ _id: new mongoose.Types.ObjectId(String(package100._id)) });
closeTo(oldPackageAfterChange.availableEarnings, 600, "package change adds the 50-USDT refund to the old package's remaining 550-USDT balance");
depositBalance = await db.collection("depositbalances").findOne({ userId: user._id, asset: "USDT" });
closeTo(depositBalance && depositBalance.available, 700, "package change debits the new plan from deposit balance");

await db.collection("depositbalances").updateOne({ userId: user._id, asset: "USDT" }, { $set: { available: 99 } });
statusIs(await api("/api/packages", {
  method: "POST",
  body: { action: "change", packageId: String(plan100._id), userPackageId: String(package200._id) },
}), 400, "package change is rejected when the new price exceeds separate deposit balance");
const activeAfterFailedChange = await db.collection("userpackages").findOne({ _id: new mongoose.Types.ObjectId(String(package200._id)) });
assert.equal(activeAfterFailedChange.status, "active", "failed package change rolls back old package cancellation");
closeTo(activeAfterFailedChange.cancellationRefund, 0, "failed package change does not credit cancellation refund");
userWallet = await db.collection("wallets").findOne({ userId: user._id, type: "spot", mode: "live" });
depositBalance = await db.collection("depositbalances").findOne({ userId: user._id, asset: "USDT" });
closeTo(depositBalance && depositBalance.available, 99, "failed package change leaves deposit balance unchanged");
await db.collection("depositbalances").updateOne({ userId: user._id, asset: "USDT" }, { $set: { available: 700 } });

ok(await api("/api/packages", { method: "POST", body: { action: "cancel", userPackageId: String(package200._id) } }), "user cancels package");
const cancelledPackage = await db.collection("userpackages").findOne({ _id: new mongoose.Types.ObjectId(String(package200._id)) });
closeTo(cancelledPackage.cancellationRefund, 100, "cancel package refunds half its activation price");
userWallet = await db.collection("wallets").findOne({ userId: user._id, type: "spot", mode: "live" });
closeTo(userWallet.balances.find((x) => x.asset === "USDT").available, 50, "package cancellation refund remains isolated from the general wallet");
const cancelledPackageWithRefund = await db.collection("userpackages").findOne({ _id: new mongoose.Types.ObjectId(String(package200._id)) });
closeTo(cancelledPackageWithRefund.availableEarnings, 300, "package card shows the 200-USDT package balance plus its 100-USDT cancellation refund");
const cancelledPackagePage = await api("/api/packages");
ok(cancelledPackagePage, "cancelled package card reports balance and withdrawal cap separately");
const cancelledPackageView = cancelledPackagePage.data.userPackages.find((x) => String(x._id) === String(package200._id));
assert.ok(cancelledPackageView, "cancelled package is still visible");
closeTo(cancelledPackageView.withdrawalLimit, 200, "cancellation refund does not lift the first-stage cap above the 200-USDT activation amount");
depositBalance = await db.collection("depositbalances").findOne({ userId: user._id, asset: "USDT" });
closeTo(depositBalance && depositBalance.available, 700, "cancellation does not change external deposit balance");

const renewed = await api("/api/packages", { method: "POST", body: { action: "activate", packageId: String(plan200._id) } });
ok(renewed, "renew package from separate deposit balance", 201);
userWallet = await db.collection("wallets").findOne({ userId: user._id, type: "spot", mode: "live" });
depositBalance = await db.collection("depositbalances").findOne({ userId: user._id, asset: "USDT" });
closeTo(userWallet.balances.find((x) => x.asset === "USDT").available, 50, "package renewal leaves general withdrawal balance unchanged");
closeTo(depositBalance && depositBalance.available, 500, "package renewal debits separate deposit balance");

ok(await api("/api/deposits"), "user deposit page API");
ok(await api("/api/withdrawals"), "user withdrawal history API");
ok(await api("/api/packages"), "user package page API after changes");
const adminPackages = await api("/api/admin/packages", { as: "admin" });
ok(adminPackages, "admin packages and balances API");
assert.ok(adminPackages.data.userPackages.length >= 3, "admin sees package accounts");
const adminDepositBalance = adminPackages.data.depositBalances.find((x) => String(x.userId && (x.userId._id || x.userId)) === String(user._id));
assert.ok(adminDepositBalance, "admin sees separate external deposit balance");
closeTo(adminDepositBalance.available, 500, "admin deposit table shows remaining deposit balance");
const adminWithdrawals = await api("/api/admin/withdrawals", { as: "admin" });
ok(adminWithdrawals, "admin withdrawal review API");
assert.ok(adminWithdrawals.data.withdrawals.length >= 2, "admin sees package and general withdrawal requests");

ok(await api("/api/admin/payment", {
  as: "admin", method: "PATCH",
  body: { id: String(payment._id), depositEnabled: false, withdrawalEnabled: false },
}), "admin saves deposit and withdrawal switches");
const options = await api("/api/payment-options");
ok(options, "public payment options API");
const testOption = options.data.methods.find((x) => x.asset === "USDT" && x.network === "TRC20");
assert.equal(testOption.depositEnabled, false, "deposit switch appears in API");
assert.equal(testOption.withdrawalEnabled, false, "withdrawal switch appears in API");

const disabledWithdrawal = await api("/api/withdrawals", {
  method: "POST",
  body: { asset: "USDT", network: "TRC20", address: "test-address", amount: 10, source: "wallet" },
});
statusIs(disabledWithdrawal, 400, "backend rejects withdrawal when admin disabled that channel");

const form = new FormData();
form.append("asset", "USDT");
form.append("network", "TRC20");
form.append("amount", "10");
form.append("txHash", "");
form.append("screenshot", new Blob(["test-proof"], { type: "image/png" }), "proof.png");
const disabledDeposit = await api("/api/deposits", { method: "POST", body: form });
statusIs(disabledDeposit, 400, "backend rejects deposit when admin disabled that channel");

// Simulate an account partially repaired by legacy v1 (20 moved already,
// another 70 remains across spot and funding). The original deposit predates
// the former cutover check; v3 must still recognize it and move only the remainder.
const legacyDepositAt = new Date("2026-09-01T12:00:00.000Z");
const oldRepairAt = new Date(legacyDepositAt.getTime() + 1000);
const legacyWithdrawalId = new mongoose.Types.ObjectId();
await db.collection("depositbalances").updateOne(
  { userId: user._id, asset: "USDT" },
  { $set: { available: 520 } },
);
await db.collection("wallets").updateOne(
  { userId: user._id, type: "spot", mode: "live", "balances.asset": "USDT" },
  { $set: { "balances.$.available": 20, "balances.$.locked": 0 } },
);
await db.collection("wallets").insertOne({
  userId: user._id, type: "funding", mode: "live",
  balances: [{ asset: "USDT", available: 50, locked: 0 }],
  createdAt: new Date(), updatedAt: new Date(),
});
await db.collection("ledgerentries").insertMany([
  {
    userId: user._id, scope: "user", asset: "USDT", mode: "live",
    type: "deposit", amount: 90, balanceBefore: 0, balanceAfter: 90,
    referenceId: "ci-legacy-merged-deposit", note: "CI legacy merged deposit",
    createdAt: legacyDepositAt, updatedAt: legacyDepositAt,
  },
  {
    userId: user._id, scope: "user", asset: "USDT", mode: "live",
    type: "adjustment", amount: -20, balanceBefore: 70, balanceAfter: 50,
    referenceId: "legacy-deposit-separation:" + String(user._id),
    note: "CI prior legacy repair moved 20",
    createdAt: oldRepairAt, updatedAt: oldRepairAt,
  },
]);
await db.collection("withdrawalrequests").insertOne({
  _id: legacyWithdrawalId, userId: user._id, source: "wallet", status: "pending",
  asset: "USDT", network: "TRC20", amount: 10, address: "ci-pending-address",
  createdAt: new Date(), updatedAt: new Date(),
});

let legacyWalletApi = await api("/api/wallet");
ok(legacyWalletApi, "wallet API while legacy withdrawal is pending");
let legacyDepositBalance = await db.collection("depositbalances").findOne({ userId: user._id, asset: "USDT" });
closeTo(legacyDepositBalance.available, 520, "legacy repair waits while general withdrawal is pending");
closeTo((legacyWalletApi.data.generalWithdrawalBalances || []).reduce((sum, item) => sum + (item.asset === "USDT" ? item.available : 0), 0), 70, "pending withdrawal keeps the original wallet allocation unchanged");

await db.collection("withdrawalrequests").deleteOne({ _id: legacyWithdrawalId });
legacyWalletApi = await api("/api/wallet");
ok(legacyWalletApi, "wallet API after legacy withdrawal is resolved");
legacyDepositBalance = await db.collection("depositbalances").findOne({ userId: user._id, asset: "USDT" });
closeTo(legacyDepositBalance.available, 590, "v3 repair recognizes old deposits and moves only the legacy remainder");
closeTo((legacyWalletApi.data.generalWithdrawalBalances || []).reduce((sum, item) => sum + (item.asset === "USDT" ? item.available : 0), 0), 0, "legacy deposit is removed from spot and funding withdrawal balances");
closeTo((await db.collection("wallets").findOne({ userId: user._id, type: "spot", mode: "live" })).balances.find((x) => x.asset === "USDT").available, 0, "legacy deposit portion is removed from spot");
closeTo((await db.collection("wallets").findOne({ userId: user._id, type: "funding", mode: "live" })).balances.find((x) => x.asset === "USDT").available, 0, "legacy deposit portion is removed from funding");
await api("/api/wallet");
legacyDepositBalance = await db.collection("depositbalances").findOne({ userId: user._id, asset: "USDT" });
closeTo(legacyDepositBalance.available, 590, "v3 repair is idempotent and does not double credit");

console.log("PASS: external deposit, idempotency, active referral, referral commission, package activation, first-withdrawal cap, admin settlement, balance rollback, package switch, cancellation, renewal, and admin/user APIs");
await mongoose.disconnect();
