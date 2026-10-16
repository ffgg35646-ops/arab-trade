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
  return call("/api/withdrawals", { method: "POST", cookie: userCookie, body: { type: "package", packageId: String(packageId), amount, asset: "USDT", network: "TRC20", payoutAddress: "QA-wallet-" + suffix } });
}
async function requestGeneralWithdrawal(amount) {
  return call("/api/withdrawals", { method: "POST", cookie: userCookie, body: { type: "general", amount, asset: "USDT", network: "TRC20", payoutAddress: "QA-general-wallet-" + suffix } });
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

  const createPlan = async (name, dailyProfit) => {
    const res = await call("/api/admin/packages", { method: "POST", cookie: adminCookie,
      body: { name, description: "CI only", price: 200, dailyProfit, sortOrder: 0, enabled: true } });
    assert.equal(res.status, 201, "admin create package: " + JSON.stringify(res.data));
    return res.data.package;
  };
  const planA = await createPlan("QA " + suffix + " Gold A", 600);
  const planB = await createPlan("QA " + suffix + " Gold B", 0);
  packageAId = String(planA._id); packageBId = String(planB._id);
  const catalogBeforeActivation = await call("/api/withdrawals", { cookie: userCookie });
  assert.equal(catalogBeforeActivation.status, 200);
  assert.deepEqual(catalogBeforeActivation.data.packages, [], "unactivated catalog packages must not appear on the user's withdrawal page");
  log("No unactivated package cards are shown to the user");
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
  await checkPackageBalance(oldUserPackageId, 600, 0, "daily collection");
  log("Daily Collect added $600 to the correct package account");

  const reward = await mongoose.connection.collection("rewards").insertOne({
    userId: user._id, title: "QA reward", type: "bonus", amount: 10, asset: "USDT",
    status: "available", expiresAt: null, metadata: { test: true },
    createdAt: new Date(), updatedAt: new Date(),
  });
  const claim = await call("/api/rewards", { method: "POST", cookie: userCookie, body: { rewardId: String(reward.insertedId) } });
  assert.equal(claim.status, 200, "reward claim: " + JSON.stringify(claim.data));
  await checkPackageBalance(oldUserPackageId, 610, 0, "reward credit");
  log("Reward added $10 to the active package; did not credit a general wallet");

  const change = await call("/api/packages", { method: "POST", cookie: userCookie,
    body: { action: "change", packageId: packageBId, userPackageId: oldUserPackageId } });
  assert.equal(change.status, 200, "package change: " + JSON.stringify(change.data));
  await checkPackageBalance(oldUserPackageId, 710, 0, "50% refund");
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
  assert.equal(silverCard.account.balance, 710, "old-package refund and earnings remain grouped under the original package");
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
  assert.equal((await review(generalPending._id, "reject")).status, 200);
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
  await checkPackageBalance(oldUserPackageId, 710, 0, "failed request rollback");
  log("Rejects below-minimum and >$200 initial allowance requests without touching balances");

  const rejectRequest = await requestWithdrawal(200);
  assert.equal(rejectRequest.status, 201, "withdrawal request: " + JSON.stringify(rejectRequest.data));
  const savedDestination = await latestPending();
  assert.equal(savedDestination.asset, "USDT");
  assert.equal(savedDestination.network, "TRC20");
  assert.equal(savedDestination.payoutAddress, "QA-wallet-" + suffix);
  log("Withdrawal request stores USDT network and payout address for admin review");
  await checkPackageBalance(oldUserPackageId, 510, 200, "pending reserve");
  const secondWhilePending = await requestWithdrawal(100);
  assert.equal(secondWhilePending.status, 409, "second pending withdrawal must be blocked");
  assert.equal(await mongoose.connection.collection("withdrawalrequests").countDocuments({ userId: user._id, status: "pending" }), 1);
  let pending = await latestPending();
  const rejection = await review(pending._id, "reject");
  assert.equal(rejection.status, 200, "admin rejection: " + JSON.stringify(rejection.data));
  await checkPackageBalance(oldUserPackageId, 710, 0, "rejection return");
  const repeatReject = await review(pending._id, "reject");
  assert.equal(repeatReject.status, 409, "same request cannot be rejected twice");
  await checkPackageBalance(oldUserPackageId, 710, 0, "repeat rejection protection");
  log("Single pending request enforced; rejection returned the full amount once; duplicate review blocked");

  // Concurrent duplicate requests: at most one request may reserve today's package cap.
  const concurrent = await Promise.all([requestWithdrawal(100), requestWithdrawal(100)]);
  assert.equal(concurrent.filter((x) => x.status === 201).length, 1,
    "only one of two concurrent request submissions must succeed: " + JSON.stringify(concurrent.map(x => ({status:x.status,message:x.data.message}))));
  assert.equal(await mongoose.connection.collection("withdrawalrequests").countDocuments({ userId: user._id, status: "pending" }), 1);
  await checkPackageBalance(oldUserPackageId, 610, 100, "concurrent request reservation");
  pending = await latestPending();
  assert.equal((await review(pending._id, "reject")).status, 200);
  await checkPackageBalance(oldUserPackageId, 710, 0, "concurrent rejection return");
  log("Concurrent duplicate submits created one pending request; rejection restored balance and today's cap");

  const initialApproveRequest = await requestWithdrawal(200);
  assert.equal(initialApproveRequest.status, 201, "first daily-cap withdrawal: " + JSON.stringify(initialApproveRequest.data));
  pending = await latestPending();
  const approved = await review(pending._id, "approve");
  assert.equal(approved.status, 200, "admin approval: " + JSON.stringify(approved.data));
  await checkPackageBalance(oldUserPackageId, 510, 0, "approved initial-cap debit");
  log("Approved $200 today; package still holds $510 from collected earnings and cancellation refund");

  // Simulate a new UTC day by moving only this CI-only approval timestamp back a day.
  // No package or wallet balance is changed by this test fixture operation.
  const yesterday = new Date(Date.now() - 24 * 60 * 60 * 1000);
  const priorApproval = await mongoose.connection.collection("withdrawalrequests").findOne({
    userId: user._id, packageId: new mongoose.Types.ObjectId(packageAId), status: "approved", type: "package",
  }, { sort: { createdAt: -1 } });
  assert.ok(priorApproval, "Expected an approved package withdrawal to verify daily reset");
  await mongoose.connection.collection("withdrawalrequests").updateOne(
    { _id: priorApproval._id },
    { $set: { createdAt: yesterday } },
  );

  // Referrals and arbitrary profit sources must not raise the same day's cap.
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
      address: "QA test address", status: "approved", adminNote: "isolated CI seed",
      createdAt: new Date(), updatedAt: new Date(),
    });
  }

  let state = await getPackageState(packageAId);
  assert.equal(state.balance, 510, "the package balance should remain intact after the previous day's approved withdrawal");
  assert.equal(state.allowance, 200, "the full activation-based daily cap should reset on a new UTC day");
  assert.equal(state.available, 200, "new UTC day should make at most the $200 activation amount available");
  log("Next UTC day restores today's cap to $200 without adding or changing any package balance");

  const nextDayRequest = await requestWithdrawal(200);
  assert.equal(nextDayRequest.status, 201, "new-day withdrawal should be allowed up to the activation amount");
  pending = await latestPending();
  assert.equal((await review(pending._id, "approve")).status, 200);
  await checkPackageBalance(oldUserPackageId, 310, 0, "approved new-day cap");
  state = await getPackageState(packageAId);
  assert.equal(state.balance, 310);
  assert.equal(state.allowance, 0, "today's $200 approved withdrawal should consume today's cap");
  assert.equal(state.available, 0, "second withdrawal today should show zero remaining daily allowance");

  const overDailyCap = await requestWithdrawal(100);
  assert.equal(overDailyCap.status, 409, "a second day's-limit request must be blocked after today's cap is used");
  assert.equal(overDailyCap.data.message, "تم استنفاد حد السحب اليومي لهذه الباقة");
  await checkPackageBalance(oldUserPackageId, 310, 0, "blocked second withdrawal today");
  log("Once $200 is approved today, remaining $310 stays in the package but is unavailable for another withdrawal today");

  deposit = await mongoose.connection.collection("depositbalances").findOne({ userId: user._id, asset: "USDT" });
  assert.equal(deposit.available, 100, "withdrawals must not alter the separate deposit balance");
  assert.equal(deposit.locked, 0);
  log("Package withdrawal operations do not alter the separate deposit balance");
  log("ALL WITHDRAWAL END-TO-END SCENARIOS PASSED");
} catch (error) {
  console.error("[E2E] FAILED:", error?.stack || error);
  process.exitCode = 1;
} finally {
  await mongoose.disconnect().catch(() => {});
}
