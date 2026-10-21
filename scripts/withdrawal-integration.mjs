import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import bcrypt from "bcryptjs";
import mongoose from "mongoose";

const base = process.env.TEST_BASE_URL || "http://127.0.0.1:3000";
const mongoUri = process.env.MONGODB_URI;
assert.ok(mongoUri, "MONGODB_URI must point to an isolated test database");
const mongoDbName = decodeURIComponent(new URL(mongoUri).pathname.slice(1));
assert.equal(
  mongoDbName,
  "arabtrade_withdrawal_ci",
  "Safety stop: this integration test drops its database and may run only against the dedicated arabtrade_withdrawal_ci database.",
);
const log = (name, detail = "PASS") => console.log(`[E2E] ${detail}: ${name}`);
const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
let userId, adminId, packageAId, packageBId, oldUserPackageId;
let userCookie = "", adminCookie = "";
const suffix = randomUUID().replaceAll("-", "").slice(0, 10).toLowerCase();
const testPassword = "Withdrawal-CI-Only-2026!";
const validTrcAddress = "T" + "A".repeat(33);
const invalidBepAddress = "0x" + "a".repeat(40);

async function call(path, { method = "GET", cookie = "", body } = {}) {
  const headers = {};
  if (cookie) headers.cookie = cookie;
  if (body !== undefined) headers["content-type"] = "application/json";
  const response = await fetch(base + path, {
    method, headers, body: body === undefined ? undefined : JSON.stringify(body),
  });
  const raw = await response.text();
  let data;
  try { data = raw ? JSON.parse(raw) : {}; } catch { data = { raw }; }
  return { status: response.status, data };
}
async function login(identifier) {
  const response = await fetch(base + "/api/auth/login", {
    method: "POST", headers: { "content-type": "application/json" },
    body: JSON.stringify({ identifier, password: testPassword }),
  });
  const data = await response.json();
  assert.equal(response.status, 200, "test account login should work: " + JSON.stringify(data));
  const cookieRows = response.headers.getSetCookie?.() || [response.headers.get("set-cookie") || ""];
  const row = cookieRows.find((v) => v.startsWith("arabtrade_session="));
  assert.ok(row, "login did not return session cookie");
  return "arabtrade_session=" + row.split(";")[0].split("=").slice(1).join("=");
}
async function createUser({ role = "user", referredBy = null, index = "" } = {}) {
  const _id = new mongoose.Types.ObjectId();
  const username = (role === "admin_leader" ? "qa_admin_" : "qa_user_") + suffix + index;
  const email = username + "@example.test";
  const password = await bcrypt.hash(testPassword, 4);
  await mongoose.connection.collection("users").insertOne({
    _id, name: role === "admin_leader" ? "QA Admin" : "QA User",
    username, email, password, role, referralCode: "QA" + suffix.toUpperCase() + index,
    referredBy, isVerified: true, isActive: true,
    createdAt: new Date(), updatedAt: new Date(),
  });
  return { _id, username, email };
}
async function checkPackageBalance(id, available, locked, label) {
  const row = await mongoose.connection.collection("userpackages").findOne({ _id: new mongoose.Types.ObjectId(id) });
  assert.ok(row, "test user package is missing");
  assert.equal(Number(row.availableEarnings), available, label + " availableEarnings");
  assert.equal(Number(row.lockedEarnings), locked, label + " lockedEarnings");
  return row;
}
async function getPackageState(id) {
  const { status, data } = await call("/api/withdrawals", { cookie: userCookie });
  assert.equal(status, 200, "withdrawal page API should load");
  const plan = data.packages.find((item) => item._id === String(id));
  assert.ok(plan?.account, "expected one package-level withdrawal card");
  return plan.account;
}
async function requestWithdrawal(amount, packageId = packageAId) {
  return call("/api/withdrawals", { method: "POST", cookie: userCookie, body: { type: "package", packageId: String(packageId), amount, asset: "USDT", network: "TRC20", payoutAddress: validTrcAddress } });
}
async function requestGeneralWithdrawal(amount) {
  return call("/api/withdrawals", { method: "POST", cookie: userCookie, body: { type: "general", amount, asset: "USDT", network: "TRC20", payoutAddress: validTrcAddress } });
}
async function review(requestId, action) {
  return call("/api/admin/withdrawals", { method: "PATCH", cookie: adminCookie, body: { id: String(requestId), action } });
}
async function latestPending() {
  const pending = await mongoose.connection.collection("withdrawalrequests").findOne({
    userId: new mongoose.Types.ObjectId(userId), status: "pending",
  }, { sort: { createdAt: -1 } });
  assert.ok(pending, "expected one pending request");
  return pending;
}

try {
  await mongoose.connect(mongoUri, { serverSelectionTimeoutMS: 15000 });
  await mongoose.connection.dropDatabase();

  const admin = await createUser({ role: "admin_leader" });
  const user = await createUser();
  adminId = String(admin._id); userId = String(user._id);
  await mongoose.connection.collection("depositbalances").insertOne({
    userId: user._id, asset: "USDT", available: 500, locked: 0,
    createdAt: new Date(), updatedAt: new Date(),
  });
  await mongoose.connection.collection("assets").insertOne({
    _id: new mongoose.Types.ObjectId(), name: "Tether", symbol: "USDT", type: "crypto",
    enabled: true, depositEnabled: true, tradingEnabled: true, sortOrder: 0,
    networks: [{
      _id: new mongoose.Types.ObjectId(), name: "TRON", code: "TRC20", enabled: true,
      depositEnabled: true, depositAddress: "QA deposit address", memoTag: "",
      confirmations: 1, minDeposit: 0, maxDeposit: 0, warning: "", sortOrder: 0,
    }],
    createdAt: new Date(), updatedAt: new Date(),
  });
  userCookie = await login(user.email);
  adminCookie = await login(admin.email);
  log("Created fresh synthetic user and admin in isolated MongoDB; authenticated through real login API");

  const health = await call("/api/health");
  assert.equal(health.status, 200);
  assert.equal(health.data.database, "connected");
  log("Application is connected to the isolated database");

  const wrongNetworkAddress = await call("/api/withdrawals", {
    method: "POST",
    cookie: userCookie,
    body: {
      type: "general",
      amount: 100,
      asset: "USDT",
      network: "TRC20",
      payoutAddress: invalidBepAddress,
    },
  });
  assert.equal(wrongNetworkAddress.status, 400, "an EVM address must not be accepted on TRC20");
  assert.match(wrongNetworkAddress.data.message, /TRC20/);
  assert.equal(
    await mongoose.connection.collection("withdrawalrequests").countDocuments({ userId: user._id }),
    0,
    "rejecting an address with the wrong network format must not create a withdrawal or reserve funds",
  );
  log("Rejects a BEP20-shaped address for TRC20 before creating a withdrawal request");

  const createPlan = async (name, dailyProfit) => {
    const res = await call("/api/admin/packages", { method: "POST", cookie: adminCookie,
      body: { name, description: "CI only", price: 200, dailyProfit, sortOrder: 0, enabled: true } });
    assert.equal(res.status, 201, "admin create package: " + JSON.stringify(res.data));
    return res.data.package;
  };
  const planA = await createPlan("QA " + suffix + " Gold A", 900);
  const planB = await createPlan("QA " + suffix + " Gold B", 0);
  packageAId = String(planA._id); packageBId = String(planB._id);
  const catalogBeforeActivation = await call("/api/withdrawals", { cookie: userCookie });
  assert.equal(catalogBeforeActivation.status, 200);
  assert.equal(catalogBeforeActivation.data.packages.length, 2,
    "each newly created package must immediately appear as a withdrawal card");
  assert.ok(catalogBeforeActivation.data.packages.every((item) => item.account && item.account.hasAccount === false),
    "unactivated packages must show their own card but must not allow withdrawals");
  log("Each newly created package immediately has its own disabled withdrawal card");
  const unactivatedWithdrawal = await requestWithdrawal(100, packageBId);
  assert.equal(unactivatedWithdrawal.status, 409, "a visible but unactivated package must not accept withdrawals");
  assert.match(unactivatedWithdrawal.data.message, /لم يتم تفعيل هذه الباقة/);
  assert.equal(await mongoose.connection.collection("withdrawalrequests").countDocuments({ userId: user._id }), 0,
    "unactivated package withdrawal must not create a request");
  const minSet = await call("/api/admin/withdrawals", { method: "PATCH", cookie: adminCookie,
    body: { action: "minimum", packageId: packageAId, minimum: 125 } });
  assert.equal(minSet.status, 200);
  const activate = await call("/api/packages", { method: "POST", cookie: userCookie, body: { action: "activate", packageId: packageAId } });
  assert.equal(activate.status, 201, "package activation: " + JSON.stringify(activate.data));
  oldUserPackageId = String(activate.data.userPackage._id);
  let deposit = await mongoose.connection.collection("depositbalances").findOne({ userId: user._id, asset: "USDT" });
  assert.equal(deposit.available, 300, "activation should spend deposit balance only");
  log("Activated first package using deposit balance only (500 -> 300)");

  await mongoose.connection.collection("userpackages").updateOne(
    { _id: new mongoose.Types.ObjectId(oldUserPackageId) },
    { $set: { lastProfitAt: new Date(Date.now() - 24 * 60 * 60 * 1000 - 5 * 60 * 1000) } },
  );
  const collect = await call("/api/packages", { method: "POST", cookie: userCookie,
    body: { action: "collect", userPackageId: oldUserPackageId } });
  assert.equal(collect.status, 200, "collect: " + JSON.stringify(collect.data));
  await checkPackageBalance(oldUserPackageId, 900, 0, "daily collection");
  const afterCollectView = await call("/api/withdrawals", { cookie: userCookie });
  assert.equal(afterCollectView.status, 200);
  assert.equal(afterCollectView.data.packages.find((item) => item._id === packageAId).account.balance, 900,
    "collected daily profit must appear in its own package withdrawal card");
  log("Daily Collect added $900 to the correct package withdrawal balance and API card");

  const reward = await mongoose.connection.collection("rewards").insertOne({
    userId: user._id, title: "QA reward", type: "bonus", amount: 10, asset: "USDT",
    status: "available", expiresAt: null, metadata: { test: true },
    createdAt: new Date(), updatedAt: new Date(),
  });
  const claim = await call("/api/rewards", { method: "POST", cookie: userCookie, body: { rewardId: String(reward.insertedId) } });
  assert.equal(claim.status, 200, "reward claim: " + JSON.stringify(claim.data));
  await checkPackageBalance(oldUserPackageId, 910, 0, "reward credit");
  log("Reward added $10 to the active package; did not credit a general wallet");

  const change = await call("/api/packages", { method: "POST", cookie: userCookie,
    body: { action: "change", packageId: packageBId, userPackageId: oldUserPackageId } });
  assert.equal(change.status, 200, "package change: " + JSON.stringify(change.data));
  await checkPackageBalance(oldUserPackageId, 1010, 0, "50% refund");
  deposit = await mongoose.connection.collection("depositbalances").findOne({ userId: user._id, asset: "USDT" });
  assert.equal(deposit.available, 100, "changing package should spend only new package activation from deposits");
  log("Changed package; exactly $100 refund credited back to old package, deposit balance remained separate");

  // Simulate 20 cancelled activations from repeated Silver/Gold-style changes.
  // The UI/API must still return only one balance card per actual package ID.
  const historicalActivations = Array.from({ length: 20 }, (_, index) => {
    const historicalPlanId = index % 2 === 0 ? packageAId : packageBId;
    const historicalName = index % 2 === 0 ? planA.name : planB.name;
    const historicalDate = new Date(Date.now() - (index + 1) * 24 * 60 * 60 * 1000);
    return {
      _id: new mongoose.Types.ObjectId(),
      userId: user._id,
      packageId: new mongoose.Types.ObjectId(historicalPlanId),
      packageName: historicalName,
      investedAmount: 200,
      asset: "USDT",
      durationDays: 0,
      status: "cancelled",
      availableEarnings: 0,
      lockedEarnings: 0,
      totalRealizedEarnings: 0,
      cancellationRefund: 0,
      cancellationRefundPackageCredited: true,
      activatedAt: historicalDate,
      lastProfitAt: historicalDate,
      cancelledAt: historicalDate,
      createdAt: historicalDate,
      updatedAt: historicalDate,
    };
  });
  await mongoose.connection.collection("userpackages").insertMany(historicalActivations);

  const afterPackageChange = await call("/api/withdrawals", { cookie: userCookie });
  assert.equal(afterPackageChange.status, 200);
  assert.equal(afterPackageChange.data.packages.length, 2, "20 historic activation records must still produce just two package cards");
  assert.deepEqual(
    afterPackageChange.data.packages.map((item) => item._id).sort(),
    [packageAId, packageBId].sort(),
    "each visible card must represent a distinct catalog package ID",
  );
  const silverCard = afterPackageChange.data.packages.find((item) => item._id === packageAId);
  const goldCard = afterPackageChange.data.packages.find((item) => item._id === packageBId);
  assert.equal(silverCard.account.balance, 1010, "old-package refund and earnings remain grouped under the original package");
  assert.equal(silverCard.account.available, 200, "the old package's own withdrawal allowance is preserved");
  assert.ok(goldCard.account.hasAccount, "the newly active package has its own card");
  log("Twenty historic activation records produce one Silver card and one Gold card with package-specific balances");

  await mongoose.connection.collection("wallets").insertOne({
    userId: user._id, type: "spot", mode: "live",
    balances: [{ asset: "USDT", available: 50, locked: 0 }],
    createdAt: new Date(), updatedAt: new Date(),
  });
  const generalMinSet = await call("/api/admin/withdrawals", { method: "PATCH", cookie: adminCookie,
    body: { action: "generalMinimum", minimum: 25 } });
  assert.equal(generalMinSet.status, 200, "admin can configure general withdrawal minimum");
  const belowGeneralMinimum = await requestGeneralWithdrawal(20);
  assert.equal(belowGeneralMinimum.status, 409);
  assert.match(belowGeneralMinimum.data.message, /الحد الأدنى للسحب العام هو 25/);
  let generalWallet = await mongoose.connection.collection("wallets").findOne({ userId: user._id, type: "spot", mode: "live" });
  assert.equal(generalWallet.balances.find((row) => row.asset === "USDT").available, 50);
  const generalRequest = await requestGeneralWithdrawal(25);
  assert.equal(generalRequest.status, 201, "general withdrawal request should reserve trading USDT");
  generalWallet = await mongoose.connection.collection("wallets").findOne({ userId: user._id, type: "spot", mode: "live" });
  assert.equal(generalWallet.balances.find((row) => row.asset === "USDT").available, 25);
  let generalPending = await latestPending();
  assert.equal(generalPending.type, "general");
  const generalRequestNoticeCount = await mongoose.connection.collection("notifications")
    .countDocuments({ userId: user._id, type: "withdrawal", title: "تم استلام طلب السحب" });
  assert.equal(generalRequestNoticeCount, 1, "the user should receive a notice when a general withdrawal is created");
  const adminPendingGeneral = await call("/api/admin/notifications-summary", { cookie: adminCookie });
  assert.equal(adminPendingGeneral.status, 200);
  assert.equal(adminPendingGeneral.data.counts.withdrawals, 1, "admin notification menu should count the pending general withdrawal");
  const generalSummary = await call("/api/withdrawals", { cookie: userCookie });
  assert.equal(generalSummary.data.summary.generalAvailable, 25);
  assert.equal(generalSummary.data.summary.generalLocked, undefined,
    "reserved general withdrawal amounts must not be exposed in the user summary");
  assert.equal(generalSummary.data.summary.totalBalance, 1035,
    "the grand total must exclude reserved general withdrawal amounts while pending");
  assert.equal((await review(generalPending._id, "reject")).status, 200);
  const generalReviewNoticeCount = await mongoose.connection.collection("notifications")
    .countDocuments({ userId: user._id, type: "withdrawal", title: "تم رفض طلب السحب" });
  assert.equal(generalReviewNoticeCount, 1, "the user should receive a rejection notice");
  const adminAfterGeneralReview = await call("/api/admin/notifications-summary", { cookie: adminCookie });
  assert.equal(adminAfterGeneralReview.data.counts.withdrawals, 0, "reviewed requests must disappear from pending admin count");
  const generalAfterRejectSummary = await call("/api/withdrawals", { cookie: userCookie });
  assert.equal(generalAfterRejectSummary.data.summary.totalBalance, 1060,
    "rejecting a general withdrawal returns its amount and keeps the grand total unchanged");
  generalWallet = await mongoose.connection.collection("wallets").findOne({ userId: user._id, type: "spot", mode: "live" });
  assert.equal(generalWallet.balances.find((row) => row.asset === "USDT").available, 50);
  log("General withdrawal uses configured minimum, enabled admin network and trading USDT balance; rejection returns funds");

  const setHigherMinimum = await call("/api/admin/withdrawals", { method: "PATCH", cookie: adminCookie,
    body: { action: "minimum", packageId: packageAId, minimum: 125 } });
  assert.equal(setHigherMinimum.status, 200);
  const belowChangedMinimum = await requestWithdrawal(100);
  assert.equal(belowChangedMinimum.status, 409, "changed $125 minimum must block $100 request");
  assert.match(belowChangedMinimum.data.message, /الحد الأدنى للسحب هو 125/);
  const resetMinimum = await call("/api/admin/withdrawals", { method: "PATCH", cookie: adminCookie,
    body: { action: "minimum", packageId: packageAId, minimum: 100 } });
  assert.equal(resetMinimum.status, 200);
  log("Admin minimum change is enforced by the live withdrawals API");

  const minimumBlock = await requestWithdrawal(99);
  assert.equal(minimumBlock.status, 409);
  assert.match(minimumBlock.data.message, /الحد الأدنى للسحب هو 100/);
  const overInitial = await requestWithdrawal(300);
  assert.equal(overInitial.status, 409);
  assert.match(overInitial.data.message, /المتاح للسحب 200/);
  await checkPackageBalance(oldUserPackageId, 1010, 0, "failed request rollback");
  log("Rejects below-minimum and >$200 initial allowance requests without touching balances");

  const rejectRequest = await requestWithdrawal(200);
  assert.equal(rejectRequest.status, 201, "withdrawal request: " + JSON.stringify(rejectRequest.data));
  const savedDestination = await latestPending();
  assert.equal(savedDestination.asset, "USDT");
  assert.equal(savedDestination.network, "TRC20");
  assert.equal(savedDestination.payoutAddress, validTrcAddress);
  const pendingHistoryResponse = await call("/api/withdrawals", { cookie: userCookie });
  const pendingHistoryRow = pendingHistoryResponse.data.requests.find((row) => row._id === String(savedDestination._id));
  assert.ok(pendingHistoryRow?.createdAt, "user withdrawal history must expose the request date");
  assert.equal(pendingHistoryRow.status, "pending");
  assert.equal(pendingHistoryRow.type, "package");
  log("Withdrawal request stores USDT network and payout address and appears in dated user history");
  await checkPackageBalance(oldUserPackageId, 810, 200, "pending reserve");
  const secondWhilePending = await requestWithdrawal(100);
  assert.equal(secondWhilePending.status, 409, "second pending withdrawal must be blocked");
  assert.equal(await mongoose.connection.collection("withdrawalrequests").countDocuments({ userId: user._id, status: "pending" }), 1);
  let pending = await latestPending();
  const rejection = await review(pending._id, "reject");
  assert.equal(rejection.status, 200, "admin rejection: " + JSON.stringify(rejection.data));
  await checkPackageBalance(oldUserPackageId, 1010, 0, "rejection return");
  const rejectedHistoryResponse = await call("/api/withdrawals", { cookie: userCookie });
  const rejectedHistoryRow = rejectedHistoryResponse.data.requests.find((row) => row._id === String(pending._id));
  assert.equal(rejectedHistoryRow.status, "rejected");
  assert.ok(rejectedHistoryRow.reviewedAt, "reviewed withdrawals must include their review timestamp");
  const repeatReject = await review(pending._id, "reject");
  assert.equal(repeatReject.status, 409, "same request cannot be rejected twice");
  await checkPackageBalance(oldUserPackageId, 1010, 0, "repeat rejection protection");
  log("Single pending request enforced; rejection returned the full amount once; duplicate review blocked");

  // Concurrent duplicate requests: at most one request may reserve the package withdrawal allowance.
  const concurrent = await Promise.all([requestWithdrawal(100), requestWithdrawal(100)]);
  assert.equal(concurrent.filter((x) => x.status === 201).length, 1,
    "only one of two concurrent request submissions must succeed: " + JSON.stringify(concurrent.map(x => ({status:x.status,message:x.data.message}))));
  assert.equal(await mongoose.connection.collection("withdrawalrequests").countDocuments({ userId: user._id, status: "pending" }), 1);
  await checkPackageBalance(oldUserPackageId, 910, 100, "concurrent request reservation");
  pending = await latestPending();
  assert.equal((await review(pending._id, "reject")).status, 200);
  await checkPackageBalance(oldUserPackageId, 1010, 0, "concurrent rejection return");
  log("Concurrent duplicate submits created one pending request; rejection restored the full available balance and allowance");

  const initialApproveRequest = await requestWithdrawal(200);
  assert.equal(initialApproveRequest.status, 201, "first base-cap withdrawal: " + JSON.stringify(initialApproveRequest.data));
  pending = await latestPending();
  const approved = await review(pending._id, "approve");
  assert.equal(approved.status, 200, "admin approval: " + JSON.stringify(approved.data));
  await checkPackageBalance(oldUserPackageId, 810, 0, "approved initial-cap debit");
  const afterBaseApproval = await call("/api/withdrawals", { cookie: userCookie });
  assert.equal(afterBaseApproval.data.packages.find((item) => item._id === packageAId).account.baseAllowance, 0,
    "the activation-based base allowance must be consumed permanently after approved withdrawals");
  const initialWithdrawNoticeCount = await mongoose.connection.collection("notifications")
    .countDocuments({ userId: user._id, type: "withdrawal", title: "تم استلام طلب السحب" });
  assert.ok(initialWithdrawNoticeCount >= 2, "the user should be notified about package withdrawal requests");
  const approvalNoticeCount = await mongoose.connection.collection("notifications")
    .countDocuments({ userId: user._id, type: "withdrawal", title: "تم قبول طلب السحب" });
  assert.ok(approvalNoticeCount >= 1, "the user should receive a notice after withdrawal approval");
  log("Approved the one-time $200 activation-based withdrawal; no next-day reset is required");

  // No new UTC day can reset the one-time package base cap.
  // Without credited active-referral deposits, an additional package withdrawal is blocked.
  const withoutReferrals = await requestWithdrawal(100);
  assert.equal(withoutReferrals.status, 409, "an exhausted one-time base cap must not reset on a later date");
  assert.equal(withoutReferrals.data.message, "تم استنفاد حد السحب؛ يلزم وجود إحالات نشطة بإيداعات معتمدة إضافية لفتح سعة جديدة");
  await checkPackageBalance(oldUserPackageId, 810, 0, "blocked after one-time base cap");
  log("The package activation cap stays exhausted after approval; no calendar-day reset");

  // Ten verified, active referrals with credited deposits totaling $1000 unlock exactly $500.
  const referrals = [];
  const testHash = await bcrypt.hash(testPassword, 4);
  for (let i = 0; i < 10; i++) {
    const referralId = new mongoose.Types.ObjectId();
    referrals.push(referralId);
    await mongoose.connection.collection("users").insertOne({
      _id: referralId, name: "QA Referral " + i, username: "qa_ref_" + suffix + "_" + i,
      email: "qa_ref_" + suffix + "_" + i + "@example.test", password: testHash,
      role: "user", referralCode: "REF" + suffix.toUpperCase() + i, referredBy: user._id,
      isVerified: true, isActive: true, createdAt: new Date(), updatedAt: new Date(),
    });
    await mongoose.connection.collection("depositrequests").insertOne({
      userId: referralId, asset: "USDT", network: "TRC20", amount: 100, txHash: "qa-" + suffix + "-" + i,
      address: "QA test address", status: "approved", creditedAt: new Date(),
      adminNote: "isolated CI seed", createdAt: new Date(), updatedAt: new Date(),
    });
  }

  let state = await getPackageState(packageAId);
  assert.equal(state.balance, 810, "referral eligibility must not credit package funds");
  assert.equal(state.baseAllowance, 0, "the one-time base cap remains exhausted");
  assert.equal(state.activeReferralCount, 10, "expected ten funded active referrals");
  assert.equal(state.referralDepositTotal, 1000, "ten $100 approved deposits must total $1000");
  assert.equal(state.referralUnlockPercent, 50, "expected default referral allowance of 50 percent");
  assert.equal(state.referralAllowance, 500, "$1000 in approved referral deposits must unlock exactly $500");
  assert.equal(state.available, 500, "available amount must be the lesser of balance and referral capacity");
  log("Ten qualifying referral deposits unlock $500 without crediting the package balance");

  // Spend $200 from the $500 referral allowance; exactly $300 should remain.
  const firstReferralRequest = await requestWithdrawal(200);
  assert.equal(firstReferralRequest.status, 201, "referral-backed $200 request: " + JSON.stringify(firstReferralRequest.data));
  const adminPendingPackage = await call("/api/admin/notifications-summary", { cookie: adminCookie });
  assert.equal(adminPendingPackage.data.counts.withdrawals, 1, "admin should count the pending package withdrawal");
  const firstReferralPending = await latestPending();
  const packageRequestNoticeCount = await mongoose.connection.collection("notifications")
    .countDocuments({ userId: user._id, type: "withdrawal", title: "تم استلام طلب السحب" });
  assert.ok(packageRequestNoticeCount >= 3, "the user should receive a notice for each accepted withdrawal request");
  const pendingSummary = await call("/api/withdrawals", { cookie: userCookie });
  assert.equal(pendingSummary.data.summary.packageAvailable, 610);
  assert.equal(pendingSummary.data.summary.packageLocked, undefined,
    "reserved package withdrawal amounts must not be exposed in the user summary");
  assert.equal(pendingSummary.data.summary.totalBalance, 660,
    "while a package withdrawal is pending, the grand total must exclude its reserved amount");
  assert.equal((await review(firstReferralPending._id, "approve")).status, 200);
  await checkPackageBalance(oldUserPackageId, 610, 0, "approved first referral-backed withdrawal");
  state = await getPackageState(packageAId);
  assert.equal(state.referralUsed, 200);
  assert.equal(state.referralAllowance, 300);
  assert.equal(state.available, 300);
  log("Approving $200 consumes $200 of referral capacity, leaving exactly $300");

  const overRemaining = await requestWithdrawal(400);
  assert.equal(overRemaining.status, 409, "request larger than remaining referral capacity must be blocked");
  assert.equal(overRemaining.data.message, "المتاح للسحب 300 USDT فقط");
  await checkPackageBalance(oldUserPackageId, 610, 0, "blocked request above remaining referral capacity");
  log("A $400 request is blocked with the exact remaining $300 allowance message");

  const lastReferralRequest = await requestWithdrawal(300);
  assert.equal(lastReferralRequest.status, 201, "remaining $300 referral allowance should be withdrawable");
  const lastReferralPending = await latestPending();
  assert.equal((await review(lastReferralPending._id, "approve")).status, 200);
  await checkPackageBalance(oldUserPackageId, 310, 0, "approved remaining referral-backed withdrawal");
  state = await getPackageState(packageAId);
  assert.equal(state.referralUsed, 500, "the full $500 referral allowance must be consumed cumulatively");
  assert.equal(state.referralAllowance, 0, "spent referral capacity cannot be reused");
  assert.equal(state.available, 0, "no allowance remains without additional approved referral deposits");

  const afterCapacitySpent = await requestWithdrawal(100);
  assert.equal(afterCapacitySpent.status, 409);
  assert.equal(afterCapacitySpent.data.message, "تم استنفاد حد السحب؛ يلزم وجود إحالات نشطة بإيداعات معتمدة إضافية لفتح سعة جديدة");
  await checkPackageBalance(oldUserPackageId, 310, 0, "no-capacity request rollback");
  log("After all $500 referral capacity is spent, another request requires additional qualifying referral deposits");

  deposit = await mongoose.connection.collection("depositbalances").findOne({ userId: user._id, asset: "USDT" });
  assert.equal(deposit.available, 100, "withdrawals must not alter the separate deposit balance");
  assert.equal(deposit.locked, 0);
  log("Package withdrawal operations do not alter the separate deposit balance");
  const finalSummaryResponse = await call("/api/withdrawals", { cookie: userCookie });
  assert.equal(finalSummaryResponse.status, 200);
  assert.equal(finalSummaryResponse.data.summary.generalAvailable, 50);
  assert.equal(finalSummaryResponse.data.summary.generalLocked, undefined,
    "reserved general withdrawal amounts are omitted from the summary");
  assert.equal(finalSummaryResponse.data.summary.packageAvailable, 310);
  assert.equal(finalSummaryResponse.data.summary.packageLocked, undefined,
    "reserved package withdrawal amounts are omitted from the summary");
  assert.equal(finalSummaryResponse.data.summary.totalBalance, 360,
    "grand total combines only unreserved general and package withdrawal balances, excluding deposit balance");
  log("Grand total includes unreserved general and package withdrawal balances, but excludes reserved and separate deposit balances");
  log("ALL WITHDRAWAL END-TO-END SCENARIOS PASSED");
} catch (error) {
  console.error("[E2E] FAILED:", error?.stack || error);
  process.exitCode = 1;
} finally {
  await mongoose.disconnect().catch(() => {});
}
