#!/usr/bin/env node

import assert from "node:assert/strict";
import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import net from "node:net";
import { spawn } from "node:child_process";
import mongoose from "mongoose";
import bcrypt from "bcryptjs";
import nextEnv from "@next/env";

const { loadEnvConfig } = nextEnv;
loadEnvConfig(process.cwd());

const configuredUri = process.env.MONGODB_URI;
if (!configuredUri) throw new Error("MONGODB_URI is not configured.");
const testUrl = new URL(configuredUri);
testUrl.pathname = "/arabtrade_test";
const testUri = testUrl.toString();
const dbName = decodeURIComponent(new URL(testUri).pathname.slice(1));
if (dbName !== "arabtrade_test") throw new Error("Safety stop: only arabtrade_test is permitted.");

const qaUsername = process.env.QA_TEST_USERNAME || "qauser_mvba0lmg625a99";
const qaPassword = process.env.QA_TEST_PASSWORD || "QaUser#100000";
const suffix = crypto.randomBytes(5).toString("hex");
const adminUsername = "qa_silver_ref_admin_" + suffix;
const adminPassword = "QaSilverAdmin#" + suffix;
const round8 = (value) => Math.round((Number(value || 0) + Number.EPSILON) * 1e8) / 1e8;
const pause = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const runStartedAt = new Date();

let connected = false;
let db = null;
let app = null;
let logFd = null;
let logFile = null;
let isolatedDir = null;
let baseUrl = null;
let adminId = null;
let userId = null;
let userCookie = null;
let adminCookie = null;
let silverId = null;
let firstRequestId = null;
let referralRequestId = null;
let referralUserIds = [];
let referralDepositRequestIds = [];
let completed = false;

async function getFreePort() {
  const server = net.createServer();
  await new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", resolve);
  });
  const port = server.address().port;
  await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  return port;
}

async function api(endpoint, options = {}) {
  const response = await fetch(baseUrl + endpoint, {
    ...options,
    headers: {
      ...(options.body ? { "Content-Type": "application/json" } : {}),
      ...(options.cookie ? { Cookie: options.cookie } : {}),
      ...(options.headers || {}),
    },
    signal: AbortSignal.timeout(10000),
  });
  const raw = await response.text();
  let body;
  try { body = JSON.parse(raw); } catch { body = { message: raw.slice(0, 700) }; }
  return { status: response.status, ok: response.ok, body, headers: response.headers };
}

function getSessionCookie(response) {
  const setCookies = typeof response.headers.getSetCookie === "function"
    ? response.headers.getSetCookie()
    : [response.headers.get("set-cookie") || ""];
  return setCookies
    .filter(Boolean)
    .map((value) => value.split(";")[0])
    .find((value) => value.startsWith("arabtrade_session="));
}

async function login(identifier, password) {
  const response = await api("/api/auth/login", {
    method: "POST",
    body: JSON.stringify({ identifier, password }),
  });
  assert.equal(response.status, 200, "Login failed for " + identifier + ": " + (response.body.message || response.status));
  const cookie = getSessionCookie(response);
  assert.ok(cookie, "No arabtrade_session cookie for " + identifier);
  return cookie;
}

async function startIsolatedApp() {
  const sourceDir = process.cwd();
  isolatedDir = fs.mkdtempSync(path.join(os.tmpdir(), "arabtrade-silver-referral-"));
  const excluded = new Set([".git", ".next", "node_modules", ".turbo", "coverage", "out"]);
  fs.cpSync(sourceDir, isolatedDir, {
    recursive: true,
    filter(source) {
      const relative = path.relative(sourceDir, source);
      if (!relative) return true;
      return !excluded.has(relative.split(path.sep)[0]);
    },
  });
  fs.symlinkSync(path.join(sourceDir, "node_modules"), path.join(isolatedDir, "node_modules"), "dir");

  const port = await getFreePort();
  baseUrl = "http://127.0.0.1:" + port;
  logFile = path.join(os.tmpdir(), "arabtrade-silver-referral-" + port + ".log");
  logFd = fs.openSync(logFile, "a");
  app = spawn("npm", ["run", "dev", "--", "--webpack", "--hostname", "127.0.0.1", "--port", String(port)], {
    cwd: isolatedDir,
    env: {
      ...process.env,
      MONGODB_URI: testUri,
      AUTH_SECRET: process.env.AUTH_SECRET || crypto.randomBytes(32).toString("hex"),
      NODE_ENV: "development",
      PORT: String(port),
      TURBOREPO_ROOT: isolatedDir,
    },
    detached: true,
    stdio: ["ignore", logFd, logFd],
  });
  fs.closeSync(logFd);
  logFd = null;
  app.unref();

  for (let attempt = 0; attempt < 120; attempt += 1) {
    try {
      const response = await fetch(baseUrl + "/api/health", { signal: AbortSignal.timeout(2000) });
      const body = await response.json().catch(() => ({}));
      if (response.ok && body.database === "connected") return;
    } catch {}
    await pause(1000);
  }
  const tail = fs.existsSync(logFile) ? fs.readFileSync(logFile, "utf8").slice(-6000) : "";
  throw new Error("Isolated local app did not start; no test withdrawal was requested. Log: " + logFile + "\n" + tail);
}

async function packageSnapshot() {
  const rows = await db.collection("userpackages")
    .find({ userId, packageId: silverId })
    .sort({ createdAt: 1, _id: 1 })
    .toArray();
  return {
    balance: round8(rows.reduce((sum, row) => sum + Number(row.availableEarnings || 0), 0)),
    locked: round8(rows.reduce((sum, row) => sum + Number(row.lockedEarnings || 0), 0)),
    rows: rows.map((row) => ({
      id: String(row._id),
      availableEarnings: round8(row.availableEarnings),
      lockedEarnings: round8(row.lockedEarnings),
      investedAmount: round8(row.investedAmount),
      status: row.status,
    })),
  };
}

async function getSilverCard() {
  const response = await api("/api/withdrawals", { cookie: userCookie });
  assert.equal(response.status, 200, "GET /api/withdrawals failed: " + (response.body.message || response.status));
  assert.equal(response.body.success, true, "Withdrawal API returned success=false.");
  const plan = (response.body.packages || []).find((item) => String(item._id) === String(silverId));
  assert.ok(plan?.account?.hasAccount, "Silver withdrawal account is not shown.");
  return plan;
}

async function requestSilver(amount) {
  return api("/api/withdrawals", {
    method: "POST",
    cookie: userCookie,
    body: JSON.stringify({
      type: "package",
      packageId: String(silverId),
      amount,
      asset: "USDT",
      network: "TRC20",
      payoutAddress: "QA-Silver-referral-" + suffix,
    }),
  });
}

async function reviewRequest(id, action) {
  return api("/api/admin/withdrawals", {
    method: "PATCH",
    cookie: adminCookie,
    body: JSON.stringify({ action, id: String(id) }),
  });
}

async function rejectAnyPendingTestRequests() {
  if (!db || !userId || !adminCookie || !silverId) return;
  const pending = await db.collection("withdrawalrequests").find({
    userId,
    packageId: silverId,
    status: "pending",
    createdAt: { $gte: runStartedAt },
  }).toArray();
  for (const row of pending) {
    const response = await reviewRequest(row._id, "reject");
    if (response.status !== 200 || response.body?.success !== true) {
      console.error("Recovery warning: request " + row._id + " remains pending; inspect it before another test.");
    }
  }
}

async function removeReferralFixturesOnFailure() {
  if (completed || !db || !referralUserIds.length) return;
  await db.collection("depositrequests").deleteMany({ _id: { $in: referralDepositRequestIds } });
  await db.collection("depositbalances").deleteMany({ userId: { $in: referralUserIds } });
  await db.collection("users").deleteMany({ _id: { $in: referralUserIds } });
}

async function main() {
  try {
    await mongoose.connect(testUri, { dbName, serverSelectionTimeoutMS: 12000 });
    connected = true;
    db = mongoose.connection.db;

    const user = await db.collection("users").findOne({
      username: qaUsername,
      isActive: true,
      isVerified: true,
    });
    assert.ok(user, "QA user not found in arabtrade_test: " + qaUsername);
    userId = user._id;

    const silver = await db.collection("investmentpackages").findOne({ name: /^Silver$/i });
    assert.ok(silver, "Silver package not found in arabtrade_test.");
    silverId = silver._id;
    assert.equal(round8(silver.price), 100, "Safety stop: Silver price must be 100 USDT.");

    const accounts = await db.collection("userpackages")
      .find({ userId, packageId: silverId })
      .sort({ createdAt: 1, _id: 1 })
      .toArray();
    assert.ok(accounts.length > 0, "QA user has no Silver package account.");
    assert.equal(accounts.filter((row) => row.status === "active").length, 1,
      "QA user must have exactly one active Silver account.");
    assert.equal(accounts.findIndex((row) => row.status === "active"), accounts.length - 1,
      "The active Silver activation must be the latest activation record.");
    const firstActivation = accounts.find((row) => Number(row.investedAmount || 0) > 0);
    assert.equal(round8(firstActivation?.investedAmount), 100, "Safety stop: first Silver activation must be 100 USDT.");

    const allAccounts = await db.collection("userpackages").find({ userId }).toArray();
    assert.equal(
      round8(allAccounts.reduce((sum, row) => sum + Number(row.lockedEarnings || 0), 0)),
      0,
      "QA account already has locked package funds; no test writes were made.",
    );
    const initialBalance = await packageSnapshot();
    assert.equal(initialBalance.balance, 600,
      "Safety stop: Silver balance must be exactly 600 USDT before the test.");
    assert.equal(initialBalance.locked, 0, "Safety stop: Silver has locked funds.");

    const pending = await db.collection("withdrawalrequests").countDocuments({ userId, status: "pending" });
    assert.equal(pending, 0, "QA user already has a pending withdrawal; no test requests were created.");
    const preexistingRequestIds = (await db.collection("withdrawalrequests").find({ userId }).toArray())
      .map((row) => String(row._id)).sort();

    const existingActiveReferralIds = (await db.collection("users").find({
      referredBy: userId,
      role: "user",
      isActive: true,
      isVerified: true,
    }).project({ _id: 1 }).toArray()).map((row) => row._id);
    const existingQualifyingDeposit = existingActiveReferralIds.length
      ? await db.collection("depositrequests").aggregate([
          { $match: {
            userId: { $in: existingActiveReferralIds },
            asset: "USDT",
            status: "approved",
            creditedAt: { $ne: null },
          } },
          { $group: { _id: null, total: { $sum: "$amount" } } },
        ]).toArray()
      : [];
    assert.equal(round8(existingQualifyingDeposit[0]?.total || 0), 0,
      "Active referral deposits already exist for this QA user; stopping to avoid duplicating the referral fixture.");

    await startIsolatedApp();
    userCookie = await login(user.username, qaPassword);

    const initialCard = await getSilverCard();
    assert.equal(round8(initialCard.account.balance), 600, "Withdrawal API balance must match the QA database.");
    assert.equal(round8(initialCard.account.dailyAllowance), 100, "Expected a fresh 100-USDT daily base allowance.");
    assert.equal(round8(initialCard.account.referralDepositTotal), 0, "Expected no referral deposits before the referral fixture.");
    assert.equal(round8(initialCard.account.referralAllowance), 0, "Expected no referral-backed allowance before the fixture.");
    assert.equal(round8(initialCard.account.available), 100, "Expected 100 USDT available for the first request.");
    assert.equal(round8(initialCard.account.referralUnlockPercent), 50, "Safety stop: the test expects a configured unlock rate of 50%.");

    const adminObjectId = new mongoose.Types.ObjectId();
    adminId = adminObjectId;
    await db.collection("users").insertOne({
      _id: adminObjectId,
      name: "QA Silver Referral Admin",
      username: adminUsername,
      email: adminUsername + "@example.test",
      password: await bcrypt.hash(adminPassword, 10),
      role: "admin_leader",
      referralCode: "QA" + suffix.toUpperCase(),
      referredBy: null,
      isVerified: true,
      isActive: true,
      createdAt: new Date(),
      updatedAt: new Date(),
    });
    adminCookie = await login(adminUsername, adminPassword);

    // Stage 1: make a genuine API withdrawal request for 100 and approve it through the admin API.
    const firstResponse = await requestSilver(100);
    assert.equal(firstResponse.status, 201,
      "First 100-USDT request failed: " + (firstResponse.body.message || firstResponse.status));
    const firstRequest = await db.collection("withdrawalrequests").findOne({
      userId,
      packageId: silverId,
      type: "package",
      status: "pending",
      amount: 100,
    }, { sort: { createdAt: -1 } });
    assert.ok(firstRequest, "First 100-USDT withdrawal request was not stored.");
    firstRequestId = firstRequest._id;

    let snapshot = await packageSnapshot();
    assert.equal(snapshot.balance, 500, "First request must reduce available Silver balance from 600 to 500.");
    assert.equal(snapshot.locked, 100, "First request must reserve 100 USDT in locked earnings.");

    const firstApproval = await reviewRequest(firstRequestId, "approve");
    assert.equal(firstApproval.status, 200, "Admin approval returned HTTP " + firstApproval.status + ".");
    assert.equal(firstApproval.body?.success, true, "Admin could not approve the first 100-USDT withdrawal.");
    const firstAfter = await db.collection("withdrawalrequests").findOne({ _id: firstRequestId });
    assert.equal(firstAfter.status, "approved", "First 100-USDT request did not become approved.");
    snapshot = await packageSnapshot();
    assert.equal(snapshot.balance, 500, "Approved first withdrawal must permanently consume 100 USDT.");
    assert.equal(snapshot.locked, 0, "Approval must clear the package lock.");
    const afterApprovalCard = await getSilverCard();
    assert.equal(round8(afterApprovalCard.account.dailyAllowance), 0, "The approved 100-USDT request should use today's base cap.");
    assert.equal(round8(afterApprovalCard.account.available), 0, "Without referrals, no extra amount should be available after the first approval.");

    // Stage 2: an additional 500 must fail before the referrals have funded deposits.
    const noReferralRequest = await requestSilver(500);
    assert.equal(noReferralRequest.status, 409,
      "The second 500-USDT request should be blocked before active referrals have credited deposits.");
    assert.match(noReferralRequest.body.message || "", /إحالات نشطة بإيداعات معتمدة/,
      "The second request should explain the active-referral deposit requirement.");
    const requestIdsAfterBlocked = (await db.collection("withdrawalrequests").find({ userId }).toArray())
      .map((row) => String(row._id)).sort();
    assert.deepEqual(requestIdsAfterBlocked, [...preexistingRequestIds, String(firstRequestId)].sort(),
      "Blocked 500-USDT request unexpectedly created a database row.");
    snapshot = await packageSnapshot();
    assert.equal(snapshot.balance, 500, "Blocked referral request changed Silver balance.");
    assert.equal(snapshot.locked, 0, "Blocked referral request created a package lock.");

    // Stage 3: set up 10 explicitly marked QA-only active referrals, each with a credited 100-USDT deposit.
    // These fixtures live only in arabtrade_test; they are not production users or on-chain transfers.
    const now = new Date();
    const referralRows = [];
    const referralDeposits = [];
    const passwordHash = await bcrypt.hash("QA-Referral#" + suffix, 4);
    for (let index = 1; index <= 10; index += 1) {
      const referralId = new mongoose.Types.ObjectId();
      referralUserIds.push(referralId);
      const refUsername = "qa_silver_ref_" + suffix + "_" + index;
      referralRows.push({
        _id: referralId,
        name: "QA Active Referral " + index,
        username: refUsername,
        email: refUsername + "@example.test",
        password: passwordHash,
        role: "user",
        referralCode: "QAREF" + suffix.toUpperCase() + index,
        referredBy: userId,
        isVerified: true,
        isActive: true,
        createdAt: now,
        updatedAt: now,
      });
      referralDeposits.push({
        _id: new mongoose.Types.ObjectId(),
        userId: referralId,
        asset: "USDT",
        network: "TRC20",
        amount: 100,
        txHash: "",
        confirmations: 1,
        creditedAt: now,
        confirmedAt: now,
        address: "QA-only referral deposit fixture",
        status: "approved",
        adminNote: "QA ONLY: approved 100 USDT referral-deposit fixture for withdrawal integration test.",
        screenshotPath: "",
        screenshotContentType: "",
        screenshotStorage: "mongodb",
        hasScreenshot: false,
        createdAt: now,
        updatedAt: now,
      });
    }
    await db.collection("users").insertMany(referralRows);
    await db.collection("depositrequests").insertMany(referralDeposits);
    referralDepositRequestIds = referralDeposits.map((row) => row._id);
    await db.collection("depositbalances").insertMany(referralUserIds.map((id) => ({
      userId: id,
      asset: "USDT",
      available: 100,
      locked: 0,
      createdAt: now,
      updatedAt: now,
    })));

    const afterReferralCard = await getSilverCard();
    assert.equal(afterReferralCard.account.activeReferralCount, 10, "Expected exactly ten funded active referrals.");
    assert.equal(round8(afterReferralCard.account.referralDepositTotal), 1000, "Ten 100-USDT referral deposits must total 1000 USDT.");
    assert.equal(round8(afterReferralCard.account.referralUnlockPercent), 50, "Referral unlock percentage should be 50%.");
    assert.equal(round8(afterReferralCard.account.referralAllowance), 500, "1000 USDT of active referral deposits should unlock 500 USDT.");
    assert.equal(round8(afterReferralCard.account.dailyAllowance), 0, "Referral eligibility must not replenish the used daily base cap.");
    assert.equal(round8(afterReferralCard.account.available), 500, "Silver should allow the remaining 500 USDT with the referral entitlement.");

    // Stage 4: prove that the referral-backed 500-USDT request reaches the admin queue.
    const eligibleRequestResponse = await requestSilver(500);
    assert.equal(eligibleRequestResponse.status, 201,
      "500-USDT request should be accepted with 1000 USDT qualifying referral deposits: " +
      (eligibleRequestResponse.body.message || eligibleRequestResponse.status));
    const eligibleRequest = await db.collection("withdrawalrequests").findOne({
      userId,
      packageId: silverId,
      type: "package",
      status: "pending",
      amount: 500,
    }, { sort: { createdAt: -1 } });
    assert.ok(eligibleRequest, "Referral-backed 500-USDT request was not stored.");
    referralRequestId = eligibleRequest._id;
    snapshot = await packageSnapshot();
    assert.equal(snapshot.balance, 0, "Pending 500-USDT referral-backed request should reserve the remaining 500 USDT.");
    assert.equal(snapshot.locked, 500, "Pending referral-backed request should lock 500 USDT.");

    // Do not approve this second request: the explicit test asks for only the first $100 approval.
    // Reject it after proving it reached the real admin API so the QA balance is restored for follow-up tests.
    const cleanupReject = await reviewRequest(referralRequestId, "reject");
    assert.equal(cleanupReject.status, 200, "Could not reject the second QA request for cleanup.");
    assert.equal(cleanupReject.body?.success, true, "Admin cleanup rejection failed.");
    const secondAfter = await db.collection("withdrawalrequests").findOne({ _id: referralRequestId });
    assert.equal(secondAfter.status, "rejected", "Second QA request should be rejected during test cleanup.");
    snapshot = await packageSnapshot();
    assert.equal(snapshot.balance, 500, "Rejecting the second request must return its 500 USDT to Silver.");
    assert.equal(snapshot.locked, 0, "Rejected second request must leave no locked funds.");
    const finalCard = await getSilverCard();
    assert.equal(round8(finalCard.account.referralAllowance), 500, "Rejected request must not consume referral eligibility.");
    assert.equal(round8(finalCard.account.available), 500, "The 500-USDT referral-backed amount should remain eligible after rejection.");

    completed = true;
    console.log(JSON.stringify({
      result: "PASS",
      database: dbName,
      server: "isolated local Next.js API started from this working tree",
      qaUser: qaUsername,
      package: "Silver",
      testRules: {
        firstWithdrawalAmount: 100,
        referralUnlockPercent: 50,
        testReferrals: 10,
        depositPerReferral: 100,
        qualifyingReferralDeposits: 1000,
        additionalReferralAllowance: 500,
      },
      steps: {
        first100Request: {
          httpStatus: firstResponse.status,
          requestStatus: firstAfter.status,
          balanceAfterApproval: 500,
          lockedAfterApproval: 0,
        },
        second500WithoutReferrals: {
          httpStatus: noReferralRequest.status,
          message: noReferralRequest.body.message,
          requestCreated: false,
          balanceUnchanged: true,
        },
        afterAddingTenActiveReferrals: {
          count: finalCard.account.activeReferralCount,
          approvedDepositTotal: finalCard.account.referralDepositTotal,
          percent: finalCard.account.referralUnlockPercent,
          referralAllowance: afterReferralCard.account.referralAllowance,
        },
        second500WithReferrals: {
          createHttpStatus: eligibleRequestResponse.status,
          reachedAdminQueue: true,
          cleanupStatus: secondAfter.status,
          balanceRestoredAfterCleanup: snapshot.balance,
          lockedAfterCleanup: snapshot.locked,
        },
      },
      finalState: {
        silverBalance: finalCard.account.balance,
        dailyBaseAllowance: finalCard.account.dailyAllowance,
        activeFundedReferrals: finalCard.account.activeReferralCount,
        qualifyingReferralDepositTotal: finalCard.account.referralDepositTotal,
        referralAllowance: finalCard.account.referralAllowance,
        availableNow: finalCard.account.available,
        locked: finalCard.account.locked,
      },
      qaFixtures: {
        activeReferralUserIds: referralUserIds.map(String),
        approvedDepositRequestIds: referralDepositRequestIds.map(String),
        onlyInTestDatabase: true,
        retainedForFollowUpTests: true,
      },
      assertions: {
        first100ApprovedThroughAdminApi: true,
        noReferralCapacityBeforeDepositFixtures: true,
        tenDepositsUnlockExactly500: true,
        "500RequestBlockedBeforeReferrals": true,
        "500RequestAcceptedAfterReferrals": true,
        rejectedCleanupRequestReturns500: true,
        noSyntheticCreditToSilverPackage: true,
      },
      note: "One 100-USDT withdrawal was approved and permanently deducted. The 500-USDT referral-backed request was created then rejected for test cleanup, restoring the remaining Silver balance to 500. Ten active QA referral users and their 100-USDT approved deposit fixtures are retained only in arabtrade_test. No blockchain transfer took place.",
    }, null, 2));
  } finally {
    if (logFd !== null) {
      try { fs.closeSync(logFd); } catch {}
    }
    if (db && userId && adminCookie) {
      await rejectAnyPendingTestRequests().catch((error) => {
        console.error("Recovery warning rejecting pending QA requests:", error instanceof Error ? error.message : String(error));
      });
    }
    await removeReferralFixturesOnFailure().catch((error) => {
      console.error("Recovery warning removing incomplete referral fixtures:", error instanceof Error ? error.message : String(error));
    });
    if (db && adminId) {
      await db.collection("users").deleteOne({ _id: adminId }).catch(() => {});
    }
    if (app?.pid) {
      try { process.kill(-app.pid, "SIGTERM"); } catch {}
      await pause(800);
    }
    if (isolatedDir && fs.existsSync(isolatedDir)) {
      try { fs.rmSync(isolatedDir, { recursive: true, force: true }); } catch {}
    }
    if (connected) await mongoose.disconnect().catch(() => {});
  }
}

main().catch((error) => {
  console.error(JSON.stringify({
    result: "FAIL",
    error: error instanceof Error ? error.stack || error.message : String(error),
    note: "Safety stop confines all test changes to arabtrade_test. The referral fixture is removed on failure when possible. A 100-USDT approval, once completed, remains a real QA test operation; any still-pending requests created during this run are rejected in cleanup when possible.",
  }, null, 2));
  process.exitCode = 1;
});
