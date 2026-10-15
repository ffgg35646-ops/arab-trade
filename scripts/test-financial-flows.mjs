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

ok(await api("/api/admin/packages/credit", {
  as: "admin", method: "POST",
  body: { userPackageId: String(package100._id), amount: 600, note: "CI realized proceeds test credit" },
}), "admin credits realized earnings to package");
let package100Doc = await db.collection("userpackages").findOne({ _id: new mongoose.Types.ObjectId(String(package100._id)) });
closeTo(package100Doc.availableEarnings, 600, "realized earnings stay in package withdrawal bucket");

const tooLargeFirst = await api("/api/withdrawals", {
  method: "POST",
  body: { asset: "USDT", network: "TRC20", address: "user-test-address", amount: 101, source: "package", userPackageId: String(package100._id) },
});
statusIs(tooLargeFirst, 400, "first package withdrawal cannot exceed activation price");
package100Doc = await db.collection("userpackages").findOne({ _id: new mongoose.Types.ObjectId(String(package100._id)) });
closeTo(package100Doc.availableEarnings, 600, "rejected over-limit first withdrawal preserves bucket");

const firstWithdrawal = await api("/api/withdrawals", {
  method: "POST",
  body: { asset: "USDT", network: "TRC20", address: "user-test-address", amount: 100, source: "package", userPackageId: String(package100._id) },
});
ok(firstWithdrawal, "first package withdrawal in activation limit", 201);
const rejectedPackageWithdrawalId = String(firstWithdrawal.data.withdrawal._id);
package100Doc = await db.collection("userpackages").findOne({ _id: new mongoose.Types.ObjectId(String(package100._id)) });
closeTo(package100Doc.availableEarnings, 500, "package available earnings decrease while request is pending");
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
}), 400, "another package withdrawal is blocked by the package lifetime cap while the first is unresolved");

ok(await api("/api/admin/withdrawals", {
  as: "admin", method: "PATCH",
  body: { id: rejectedPackageWithdrawalId, status: "rejected", adminNote: "CI verify package balance restoration" },
}), "admin rejects package withdrawal");
package100Doc = await db.collection("userpackages").findOne({ _id: new mongoose.Types.ObjectId(String(package100._id)) });
closeTo(package100Doc.availableEarnings, 600, "rejected package withdrawal restores available earnings");
closeTo(package100Doc.lockedEarnings, 0, "rejected package withdrawal unlocks funds");
assert.equal(package100Doc.firstWithdrawalStatus, "available", "rejected first package withdrawal can be retried");

const retryFirstWithdrawal = await api("/api/withdrawals", {
  method: "POST",
  body: { asset: "USDT", network: "TRC20", address: "user-test-address", amount: 100, source: "package", userPackageId: String(package100._id) },
});
ok(retryFirstWithdrawal, "first package withdrawal can be retried after rejection", 201);
const packageWithdrawalId = String(retryFirstWithdrawal.data.withdrawal._id);
package100Doc = await db.collection("userpackages").findOne({ _id: new mongoose.Types.ObjectId(String(package100._id)) });
closeTo(package100Doc.availableEarnings, 500, "retried package withdrawal decreases available earnings");
closeTo(package100Doc.lockedEarnings, 100, "retried package withdrawal locks funds again");
assert.equal(package100Doc.firstWithdrawalStatus, "pending", "retried first package withdrawal marked pending");

statusIs(await api("/api/withdrawals", {
  method: "POST",
  body: { asset: "USDT", network: "TRC20", address: "user-test-address", amount: 10, source: "package", userPackageId: String(package100._id) },
}), 400, "second package withdrawal blocked by package lifetime cap while first request is pending");

ok(await api("/api/admin/withdrawals", {
  as: "admin", method: "PATCH",
  body: { id: packageWithdrawalId, status: "approved", adminNote: "CI approval" },
}), "admin approves package withdrawal");
ok(await api("/api/admin/withdrawals", {
  as: "admin", method: "PATCH",
  body: { id: packageWithdrawalId, status: "completed", adminNote: "CI completed payout" },
}), "admin completes package withdrawal");
package100Doc = await db.collection("userpackages").findOne({ _id: new mongoose.Types.ObjectId(String(package100._id)) });
closeTo(package100Doc.availableEarnings, 500, "remaining package earnings");
closeTo(package100Doc.lockedEarnings, 0, "completed package withdrawal unlocks reserved amount");
closeTo(package100Doc.totalWithdrawn, 100, "package withdrawal total");
assert.equal(package100Doc.firstWithdrawalStatus, "completed", "first package withdrawal marked completed");

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
  amount: 1000,
  status: "approved",
  createdAt: capTestCreatedAt,
  updatedAt: capTestCreatedAt,
});
const cappedPackagePage = await api("/api/packages");
ok(cappedPackagePage, "package page includes lifetime withdrawal cap");
const cappedPackageAccount = cappedPackagePage.data.userPackages.find((x) => String(x._id) === String(package100._id));
assert.ok(cappedPackageAccount, "capped package account is visible");
closeTo(cappedPackageAccount.packageWithdrawalUsed, 100, "completed withdrawal counts toward lifetime package cap");
closeTo(cappedPackageAccount.withdrawalLimit, 0, "lifetime package cap blocks withdrawal beyond package activation value");

const overLifetimeCap = await api("/api/withdrawals", {
  method: "POST",
  body: { asset: "USDT", network: "TRC20", address: "user-test-address", amount: 1, source: "package", userPackageId: String(package100._id) },
});
statusIs(overLifetimeCap, 400, "package withdrawals cannot exceed activation amount even when referral deposits would unlock more");
assert.match(String(overLifetimeCap.data.message || ""), /سقف السحب الإجمالي/, "over-cap withdrawal explains lifetime package cap");

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
  body: { id: String(legacyOverCapRequestId), status: "approved", adminNote: "CI ensure legacy package cap is enforced" },
});
statusIs(blockedLegacyApproval, 409, "admin cannot approve a legacy withdrawal request that pushes the package past its lifetime cap");
await db.collection("withdrawalrequests").deleteOne({ _id: legacyOverCapRequestId });

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
closeTo(oldPackageAfterChange.availableEarnings, 550, "package change refund stays inside the old package withdrawal balance");
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
closeTo(userWallet.balances.find((x) => x.asset === "USDT").available, 150, "package cancellation refund enters general withdrawal wallet");
depositBalance = await db.collection("depositbalances").findOne({ userId: user._id, asset: "USDT" });
closeTo(depositBalance && depositBalance.available, 700, "cancellation does not change external deposit balance");

const renewed = await api("/api/packages", { method: "POST", body: { action: "activate", packageId: String(plan200._id) } });
ok(renewed, "renew package from separate deposit balance", 201);
userWallet = await db.collection("wallets").findOne({ userId: user._id, type: "spot", mode: "live" });
depositBalance = await db.collection("depositbalances").findOne({ userId: user._id, asset: "USDT" });
closeTo(userWallet.balances.find((x) => x.asset === "USDT").available, 150, "package renewal leaves general withdrawal balance unchanged");
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
