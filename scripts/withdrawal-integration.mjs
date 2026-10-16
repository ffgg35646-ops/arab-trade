import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import bcrypt from "bcryptjs";
import mongoose from "mongoose";

const base = process.env.TEST_BASE_URL || "http://127.0.0.1:3000";
const mongoUri = process.env.MONGODB_URI;
assert.ok(mongoUri, "MONGODB_URI must point to an isolated test database");
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
  const plan = data.packages.flatMap((p) => p.accounts.map((a) => ({ ...a, planId: p._id, planName: p.name })))
    .find((a) => a._id === String(id));
  assert.ok(plan, "expected separate withdrawal account for package");
  return plan;
}
async function requestWithdrawal(amount, userPackageId = oldUserPackageId) {
  return call("/api/withdrawals", { method: "POST", cookie: userCookie, body: { userPackageId: String(userPackageId), amount } });
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

  const minimumBlock = await requestWithdrawal(100);
  assert.equal(minimumBlock.status, 409);
  assert.match(minimumBlock.data.message, /الحد الأدنى للسحب هو 100|رصيد سحب الباقة/);
  const overInitial = await requestWithdrawal(300);
  assert.equal(overInitial.status, 409);
  assert.match(overInitial.data.message, /المتاح للسحب 200/);
  await checkPackageBalance(oldUserPackageId, 710, 0, "failed request rollback");
  log("Rejects below-minimum and >$200 initial allowance requests without touching balances");

  const rejectRequest = await requestWithdrawal(200);
  assert.equal(rejectRequest.status, 201, "withdrawal request: " + JSON.stringify(rejectRequest.data));
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

  const initialApproveRequest = await requestWithdrawal(200);
  assert.equal(initialApproveRequest.status, 201, JSON.stringify(initialApproveRequest.data));
  pending = await latestPending();
  const approved = await review(pending._id, "approve");
  assert.equal(approved.status, 200, "admin approval: " + JSON.stringify(approved.data));
  await checkPackageBalance(oldUserPackageId, 510, 0, "approved debit");
  log("Approval finalized the $200 debit and released the reservation");

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
  let state = await getPackageState(oldUserPackageId);
  assert.equal(state.allowance, 500, "10 active referrals × $100 deposits should authorize $500 after initial $200 is used");
  assert.equal(state.available, 500, "package balance and referral allowance must both constrain available withdrawal");
  log("10 active referrals × $100 approved deposits unlock $500 allowance only after the initial $200 is used");

  const referralWithdrawal = await requestWithdrawal(200);
  assert.equal(referralWithdrawal.status, 201, JSON.stringify(referralWithdrawal.data));
  pending = await latestPending();
  assert.equal((await review(pending._id, "approve")).status, 200);
  await checkPackageBalance(oldUserPackageId, 310, 0, "referral-stage approval");
  state = await getPackageState(oldUserPackageId);
  assert.equal(state.allowance, 300);
  assert.equal(state.available, 300);
  const overReferral = await requestWithdrawal(400);
  assert.equal(overReferral.status, 409);
  assert.match(overReferral.data.message, /المتاح للسحب 300/);
  log("After another $200 withdrawal from the $500 referral allowance, remaining cap is $300; $400 blocked");

  const concurrent = await Promise.all([requestWithdrawal(100), requestWithdrawal(100)]);
  assert.equal(concurrent.filter((x) => x.status === 201).length, 1,
    "only one of two concurrent request submissions must succeed: " + JSON.stringify(concurrent.map(x => ({status:x.status,message:x.data.message}))));
  assert.equal(await mongoose.connection.collection("withdrawalrequests").countDocuments({ userId: user._id, status: "pending" }), 1);
  await checkPackageBalance(oldUserPackageId, 210, 100, "concurrent request reservation");
  pending = await latestPending();
  assert.equal((await review(pending._id, "reject")).status, 200);
  await checkPackageBalance(oldUserPackageId, 310, 0, "concurrent rejection return");
  log("Concurrent duplicate submits created exactly one pending request");

  const finalRequest = await requestWithdrawal(100);
  assert.equal(finalRequest.status, 201, JSON.stringify(finalRequest.data));
  pending = await latestPending();
  assert.equal((await review(pending._id, "approve")).status, 200);
  await checkPackageBalance(oldUserPackageId, 210, 0, "final approved request");
  assert.equal((await review(pending._id, "approve")).status, 409, "approved request cannot be approved twice");
  await checkPackageBalance(oldUserPackageId, 210, 0, "duplicate approval protection");
  state = await getPackageState(oldUserPackageId);
  assert.equal(state.available, 200, "after using $300 of $500 referral allowance, remaining allowance is $200");
  deposit = await mongoose.connection.collection("depositbalances").findOne({ userId: user._id, asset: "USDT" });
  assert.equal(deposit.available, 100, "withdrawal operations must not alter deposit balance");
  assert.equal(deposit.locked, 0);
  log("Approval cannot double-debit; deposit balance remains $100 and never enters withdrawal balances");
  log("ALL WITHDRAWAL END-TO-END SCENARIOS PASSED");
} catch (error) {
  console.error("[E2E] FAILED:", error?.stack || error);
  process.exitCode = 1;
} finally {
  await mongoose.disconnect().catch(() => {});
}
