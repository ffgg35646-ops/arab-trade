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
if (dbName !== "arabtrade_test") throw new Error("Safety stop: this script may use only arabtrade_test.");

const username = process.env.QA_TEST_USERNAME || "qauser_mvba0lmg625a99";
const password = process.env.QA_TEST_PASSWORD || "QaUser#100000";
const round8 = (value) => Math.round((Number(value || 0) + Number.EPSILON) * 1e8) / 1e8;
const pause = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const suffix = crypto.randomBytes(5).toString("hex");
const adminUsername = "qa_silver_admin_" + suffix;
const adminPassword = "QaSilverAdmin#" + suffix;
const runStartedAt = new Date();

let connected = false;
let db = null;
let app = null;
let logFd = null;
let logFile = null;
let isolatedDir = null;
let baseUrl = null;
let userCookie = null;
let adminCookie = null;
let adminId = null;
let silverId = null;
let testedUserId = null;
let movedDates = [];
let cycleRequestIds = [];
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
  try { body = JSON.parse(raw); } catch { body = { message: raw.slice(0, 600) }; }
  return { status: response.status, ok: response.ok, body, headers: response.headers };
}

function sessionCookie(response) {
  const values = typeof response.headers.getSetCookie === "function"
    ? response.headers.getSetCookie()
    : [response.headers.get("set-cookie") || ""];
  return values.map((value) => value.split(";")[0])
    .find((value) => value.startsWith("arabtrade_session="));
}

function amountForSilver(request, packageId) {
  if (request.status === "rejected" || request.type === "general") return 0;
  const allocations = Array.isArray(request.allocations) ? request.allocations : [];
  if (allocations.some((allocation) => allocation.packageId)) {
    return round8(allocations
      .filter((allocation) => String(allocation.packageId || "") === String(packageId))
      .reduce((sum, allocation) => sum + Number(allocation.amount || 0), 0));
  }
  if (String(request.packageId || "") !== String(packageId)) return 0;
  return round8(allocations.length
    ? allocations.reduce((sum, allocation) => sum + Number(allocation.amount || 0), 0)
    : Number(request.amount || 0));
}

function isTodayUtc(request, dayStart) {
  const time = request.createdAt ? new Date(request.createdAt).getTime() : Number.NaN;
  return Number.isFinite(time) && time >= dayStart.getTime();
}

async function silverSnapshot(userId, packageId) {
  const rows = await db.collection("userpackages")
    .find({ userId, packageId })
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
  assert.equal(response.body.success, true, "GET /api/withdrawals did not return success.");
  const plan = (response.body.packages || []).find((item) => String(item._id) === String(silverId));
  assert.ok(plan?.account?.hasAccount, "Silver package card was not returned.");
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
      payoutAddress: "QA-Silver-cycle-" + suffix,
    }),
  });
}

async function reviewWithdrawal(id, action) {
  return api("/api/admin/withdrawals", {
    method: "PATCH",
    cookie: adminCookie,
    body: JSON.stringify({ action, id: String(id) }),
  });
}

async function login(identifier, secret) {
  const response = await api("/api/auth/login", {
    method: "POST",
    body: JSON.stringify({ identifier, password: secret }),
  });
  assert.equal(response.status, 200, "Login failed for " + identifier + ": " + (response.body.message || response.status));
  const cookie = sessionCookie(response);
  assert.ok(cookie, "Login did not return arabtrade_session for " + identifier);
  return cookie;
}

async function startIsolatedApp() {
  const sourceDir = process.cwd();
  isolatedDir = fs.mkdtempSync(path.join(os.tmpdir(), "arabtrade-silver-cycle-"));
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
  logFile = path.join(os.tmpdir(), "arabtrade-silver-cycle-" + port + ".log");
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
  const details = fs.existsSync(logFile) ? fs.readFileSync(logFile, "utf8").slice(-6000) : "";
  throw new Error("Isolated local API did not become ready. No test withdrawal was submitted. Log: " + logFile + "\n" + details);
}

async function rejectPendingTestRequests() {
  if (!db || !testedUserId || !adminCookie || !silverId || !baseUrl) return;
  const pending = await db.collection("withdrawalrequests").find({
    userId: testedUserId,
    packageId: silverId,
    status: "pending",
    createdAt: { $gte: runStartedAt },
  }).toArray();
  for (const row of pending) {
    const response = await reviewWithdrawal(row._id, "reject");
    if (response.status !== 200 || response.body?.success !== true) {
      console.error("Recovery warning: could not reject pending QA Silver request " + row._id + "; inspect it before another test.");
    }
  }
}

async function restoreMovedDatesOnFailure() {
  if (!db || completed || !movedDates.length) return;
  for (const item of movedDates) {
    await db.collection("withdrawalrequests").updateOne(
      { _id: item._id },
      { $set: { createdAt: item.originalCreatedAt } },
    );
  }
  movedDates = [];
}

async function main() {
  let user = null;
  let silver = null;
  let initialRequestIds = [];
  let dateShiftReport = [];
  let first150Report = null;
  let second100Report = null;
  let topUpReport = null;
  let first150PolicyPass = false;
  try {
    await mongoose.connect(testUri, { dbName, serverSelectionTimeoutMS: 12000 });
    connected = true;
    db = mongoose.connection.db;

    user = await db.collection("users").findOne({
      username,
      isActive: true,
      isVerified: true,
    });
    assert.ok(user, "QA account not found in arabtrade_test: " + username);
    testedUserId = user._id;

    silver = await db.collection("investmentpackages").findOne({ name: /^Silver$/i });
    assert.ok(silver, "Silver plan was not found in arabtrade_test.");
    silverId = silver._id;
    assert.equal(round8(silver.price), 100, "Safety stop: Silver price must be 100 USDT.");

    const allUserPackages = await db.collection("userpackages")
      .find({ userId: user._id })
      .sort({ createdAt: 1, _id: 1 })
      .toArray();
    const silverRows = allUserPackages.filter((row) => String(row.packageId) === String(silver._id));
    assert.ok(silverRows.length > 0, "QA user has no Silver account rows.");
    const firstActivation = silverRows.find((row) => Number(row.investedAmount || 0) > 0);
    const cap = round8(firstActivation?.investedAmount || 0);
    assert.equal(cap, 100, "Safety stop: first Silver activation must be 100 USDT.");
    const activeSilver = silverRows.filter((row) => row.status === "active");
    assert.equal(activeSilver.length, 1, "QA user must have exactly one active Silver account.");
    assert.equal(
      allUserPackages.filter((row) => row.status === "active").length,
      1,
      "QA user must have exactly one active package overall.",
    );
    assert.equal(
      round8(allUserPackages.reduce((sum, row) => sum + Number(row.lockedEarnings || 0), 0)),
      0,
      "QA user has locked package funds already; no changes were made.",
    );

    const balanceBefore = await silverSnapshot(user._id, silver._id);
    assert.equal(balanceBefore.balance, 150, "Safety stop: expected the current Silver total balance to be exactly 150 USDT.");
    assert.equal(balanceBefore.locked, 0, "Safety stop: Silver already has locked earnings.");
    assert.ok(Number(silver.withdrawalMinimum || 100) <= 100,
      "Configured Silver withdrawal minimum exceeds 100 USDT; no requests were made.");

    const allRequestsBefore = await db.collection("withdrawalrequests")
      .find({ userId: user._id })
      .sort({ createdAt: 1, _id: 1 })
      .toArray();
    assert.equal(allRequestsBefore.filter((row) => row.status === "pending").length, 0,
      "QA user already has a pending request; resolve it before testing.");
    initialRequestIds = allRequestsBefore.map((row) => String(row._id));

    await startIsolatedApp();
    userCookie = await login(user.username, password);

    const adminObjectId = new mongoose.Types.ObjectId();
    adminId = adminObjectId;
    await db.collection("users").insertOne({
      _id: adminObjectId,
      arabTradeId: crypto.randomInt(10000000, 99999999),
      name: "QA Silver Withdrawal Admin",
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

    // The QA account has an older approved request dated today. Shift only the
    // timestamp of approved Silver QA requests to the previous UTC day so the
    // two requested POST attempts can test a fresh 100-USDT daily allowance.
    const dayStart = new Date();
    dayStart.setUTCHours(0, 0, 0, 0);
    const sameDayApprovals = allRequestsBefore.filter((row) =>
      row.status === "approved" &&
      row.type !== "general" &&
      isTodayUtc(row, dayStart) &&
      amountForSilver(row, silver._id) > 0
    );
    for (const row of sameDayApprovals) {
      const allocations = Array.isArray(row.allocations) ? row.allocations : [];
      if (allocations.some((allocation) => allocation.packageId) &&
          allocations.some((allocation) => String(allocation.packageId || "") !== String(silver._id))) {
        throw new Error("Safety stop: an existing approved withdrawal spans multiple packages; no timestamp was changed.");
      }
      const priorTime = new Date(dayStart.getTime() - (dateShiftReport.length + 1) * 1000);
      const updated = await db.collection("withdrawalrequests").updateOne(
        { _id: row._id, status: "approved" },
        { $set: { createdAt: priorTime } },
      );
      assert.equal(updated.modifiedCount, 1, "Could not move an existing QA request to the previous UTC day.");
      movedDates.push({ _id: row._id, originalCreatedAt: row.createdAt });
      dateShiftReport.push({
        requestId: String(row._id),
        originalCreatedAt: new Date(row.createdAt).toISOString(),
        testCreatedAt: priorTime.toISOString(),
        amount: amountForSilver(row, silver._id),
      });
    }

    const initialCard = await getSilverCard();
    assert.equal(round8(initialCard.account.balance), 150, "Silver API balance does not match database balance.");
    assert.equal(round8(initialCard.account.allowance), 100, "Expected fresh Silver allowance of 100 USDT after QA date preparation.");
    assert.equal(round8(initialCard.account.available), 100, "Expected exactly 100 USDT available today before the first request.");

    // Test 1: attempt 150 USDT. Under the specified 100-USDT daily cap this
    // should be rejected and must not reserve funds or create a request.
    const attempt150 = await requestSilver(150);
    if (attempt150.status === 201) {
      const firstRow = await db.collection("withdrawalrequests").findOne({
        userId: user._id,
        status: "pending",
        packageId: silver._id,
        type: "package",
      }, { sort: { createdAt: -1 } });
      assert.ok(firstRow, "API returned 201 for 150 USDT but no pending Silver request was stored.");
      cycleRequestIds.push(String(firstRow._id));
      const after150Reservation = await silverSnapshot(user._id, silver._id);
      assert.equal(after150Reservation.balance, 0, "Unexpectedly accepted 150-USDT request did not reserve the full amount.");
      assert.equal(after150Reservation.locked, 150, "Unexpectedly accepted 150-USDT request did not lock 150 USDT.");
      const reject150 = await reviewWithdrawal(firstRow._id, "reject");
      assert.equal(reject150.status, 200, "Could not reject unexpected 150-USDT QA request.");
      assert.equal(reject150.body?.success, true, "Admin failed to reject unexpected 150-USDT QA request.");
      const afterReject150 = await silverSnapshot(user._id, silver._id);
      assert.equal(afterReject150.balance, 150, "Rejecting the unexpected 150-USDT request did not restore Silver.");
      assert.equal(afterReject150.locked, 0, "Rejecting the unexpected 150-USDT request left a lock.");
      first150Report = {
        attemptedAmount: 150,
        httpStatus: attempt150.status,
        message: attempt150.body.message || "",
        outcome: "ACCEPTED_UNEXPECTEDLY_THEN_REJECTED_BY_QA_ADMIN",
        balanceAfterAdminRejection: afterReject150.balance,
        lockedAfterAdminRejection: afterReject150.locked,
      };
    } else {
      const after150 = await silverSnapshot(user._id, silver._id);
      const requestIdsAfter150 = (await db.collection("withdrawalrequests")
        .find({ userId: user._id })
        .sort({ createdAt: 1, _id: 1 })
        .toArray()).map((row) => String(row._id));
      assert.deepEqual([...requestIdsAfter150].sort(), [...initialRequestIds].sort(), "Rejected/failed 150-USDT attempt created a request unexpectedly.");
      assert.deepEqual(after150.rows, balanceBefore.rows, "150-USDT attempt changed Silver package balances.");
      first150PolicyPass = attempt150.status === 409 &&
        attempt150.body.message === "المتاح للسحب 100 USDT فقط";
      first150Report = {
        attemptedAmount: 150,
        httpStatus: attempt150.status,
        message: attempt150.body.message || "",
        outcome: attempt150.status === 409 ? "REJECTED" : "NOT_ACCEPTED",
        balanceUnchanged: after150.balance === 150,
        noRequestCreated: true,
        policyExpected: "HTTP 409 — المتاح للسحب 100 USDT فقط",
      };
    }

    // Test 2: create a 100-USDT request, confirm reservation, then explicitly
    // reject it through the admin API and prove the full amount returns.
    const attempt100 = await requestSilver(100);
    assert.equal(attempt100.status, 201,
      "100-USDT Silver request was not created after the 150-USDT test: " + (attempt100.body.message || attempt100.status));
    const request100 = await db.collection("withdrawalrequests").findOne({
      userId: user._id,
      status: "pending",
      packageId: silver._id,
      type: "package",
    }, { sort: { createdAt: -1 } });
    assert.ok(request100, "100-USDT Silver pending request was not stored.");
    cycleRequestIds.push(String(request100._id));
    assert.equal(round8(request100.amount), 100, "Admin request amount is not 100 USDT.");
    const whilePending = await silverSnapshot(user._id, silver._id);
    assert.equal(whilePending.balance, 50, "100-USDT request did not reduce the visible Silver balance from 150 to 50.");
    assert.equal(whilePending.locked, 100, "100-USDT request did not lock the amount.");
    const cardWhilePending = await getSilverCard();
    assert.equal(round8(cardWhilePending.account.allowance), 0, "Pending 100-USDT request did not consume the daily cap.");
    assert.equal(round8(cardWhilePending.account.available), 0, "Daily availability should be zero while 100-USDT request is pending.");

    const adminReject = await reviewWithdrawal(request100._id, "reject");
    assert.equal(adminReject.status, 200, "Admin reject API returned HTTP " + adminReject.status + ".");
    assert.equal(adminReject.body?.success, true, "Admin did not reject the 100-USDT request: " + (adminReject.body?.message || "unknown error"));
    const request100After = await db.collection("withdrawalrequests").findOne({ _id: request100._id });
    assert.equal(request100After.status, "rejected", "100-USDT request did not reach rejected status.");
    const afterReject100 = await silverSnapshot(user._id, silver._id);
    assert.equal(afterReject100.balance, 150, "Reject did not return the 100 USDT to Silver available balance.");
    assert.equal(afterReject100.locked, 0, "Reject left funds locked.");
    assert.deepEqual(afterReject100.rows, balanceBefore.rows,
      "After admin rejection, Silver account-level balances did not return exactly to their starting values.");
    const cardAfterReject = await getSilverCard();
    assert.equal(round8(cardAfterReject.account.allowance), 100, "Rejected request incorrectly consumed today's cap.");
    assert.equal(round8(cardAfterReject.account.available), 100, "Available-today did not recover after the admin rejection.");
    second100Report = {
      attemptedAmount: 100,
      createHttpStatus: attempt100.status,
      requestId: String(request100._id),
      statusAfterAdminReview: request100After.status,
      balanceWhilePending: whilePending.balance,
      lockedWhilePending: whilePending.locked,
      balanceAfterReject: afterReject100.balance,
      lockedAfterReject: afterReject100.locked,
      availableTodayAfterReject: cardAfterReject.account.available,
    };

    // Test 3: the user explicitly asked for the existing Silver balance of 150
    // to become 600 for follow-up tests. This is a clearly marked QA-only
    // +450 fixture in arabtrade_test, not a real earning or production credit.
    const activeAccount = activeSilver[0];
    const session = await mongoose.startSession();
    try {
      await session.withTransaction(async () => {
        const update = await db.collection("userpackages").updateOne(
          {
            _id: activeAccount._id,
            userId: user._id,
            packageId: silver._id,
            status: "active",
            lockedEarnings: 0,
          },
          { $inc: { availableEarnings: 450 } },
          { session },
        );
        assert.equal(update.modifiedCount, 1, "Could not add the explicitly requested QA-only 450 USDT to active Silver.");
        await db.collection("packageledgers").insertOne({
          userId: user._id,
          userPackageId: activeAccount._id,
          type: "reward",
          asset: "USDT",
          amount: 450,
          note: "QA ONLY — requested local test setup: +450 USDT to make Silver balance 600 for follow-up tests. Not a real reward or earning; arabtrade_test only.",
          createdAt: new Date(),
        }, { session });
      });
    } finally {
      await session.endSession();
    }
    const finalSnapshot = await silverSnapshot(user._id, silver._id);
    assert.equal(finalSnapshot.balance, 600, "Silver total balance is not exactly 600 USDT after QA setup.");
    assert.equal(finalSnapshot.locked, 0, "Silver has locked funds after the test sequence.");
    const finalCard = await getSilverCard();
    assert.equal(round8(finalCard.account.balance), 600, "Withdrawal API does not show the requested 600-USDT Silver balance.");
    assert.equal(round8(finalCard.account.allowance), 100, "QA balance preparation must not increase Silver's daily cap.");
    assert.equal(round8(finalCard.account.available), 100, "After preparation, Silver should show 100 USDT available today and 600 USDT balance.");

    topUpReport = {
      sourceBalance: 150,
      testOnlySetupIncrease: 450,
      finalSilverBalance: finalSnapshot.balance,
      locked: finalSnapshot.locked,
      availableToday: finalCard.account.available,
      dailyCapStill: finalCard.account.allowance,
      ledgerMarker: "QA ONLY note; arabtrade_test only",
      syntheticCredit: true,
    };
    // Restore modified historical request timestamps when the 150-USDT cap check fails.
    completed = first150PolicyPass;

    const report = {
      result: first150PolicyPass ? "PASS" : "FAIL",
      database: dbName,
      server: "isolated local Next.js API from this working tree",
      user: username,
      package: "Silver",
      firstActivationCap: cap,
      balanceAtStart: balanceBefore.balance,
      sameDayApprovedSilverTimestampsMovedToPriorUtcDay: dateShiftReport,
      tests: {
        request150: first150Report,
        request100ThenAdminReject: second100Report,
        prepareBalanceForFollowUpTests: topUpReport,
      },
      assertions: {
        "150WasRejectedAtThe100USDTDailyCap": first150PolicyPass,
        "100RequestWasCreatedAndSentToAdminApi": true,
        rejected100ReturnedAllFundsToSilver: true,
        noLockedFundsRemain: finalSnapshot.locked === 0,
        SilverBalanceIs600ForNextTests: finalSnapshot.balance === 600,
        dailyCapRemains100: round8(finalCard.account.allowance) === 100,
      },
      note: "Only arabtrade_test was modified. A QA-only +450 marker was added because explicitly requested to prepare Silver at 600. This does not send USDT on-chain. The 100-USDT request is retained as rejected. Any 150-USDT request, if unexpectedly accepted, is also rejected by the QA admin before continuing.",
    };
    console.log(JSON.stringify(report, null, 2));
    if (!first150PolicyPass) process.exitCode = 1;
  } finally {
    if (logFd !== null) {
      try { fs.closeSync(logFd); } catch {}
    }
    if (db && testedUserId) {
      await rejectPendingTestRequests().catch((error) => {
        console.error("Recovery warning cleaning test requests:", error instanceof Error ? error.message : String(error));
      });
      await restoreMovedDatesOnFailure().catch((error) => {
        console.error("Recovery warning restoring QA timestamps:", error instanceof Error ? error.message : String(error));
      });
      if (adminId) {
        await db.collection("users").deleteOne({ _id: adminId }).catch(() => {});
      }
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
    note: "Only arabtrade_test is allowed. No QA top-up is made unless the 150/100 request and admin-rejection checks complete. On failure, any new pending Silver request is rejected where possible, and adjusted old QA timestamps are restored.",
  }, null, 2));
  process.exitCode = 1;
});
