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
if (dbName !== "arabtrade_test") {
  throw new Error("Safety stop: this test may use only arabtrade_test.");
}

const username = process.env.QA_TEST_USERNAME || "qauser_mvba0lmg625a99";
const password = process.env.QA_TEST_PASSWORD || "QaUser#100000";
const round8 = (value) => Math.round((Number(value || 0) + Number.EPSILON) * 1e8) / 1e8;
const pause = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const suffix = crypto.randomBytes(5).toString("hex");
const adminUsername = "qa_silver_admin_" + suffix;
const adminPassword = "QaSilverAdmin#" + suffix;

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
let movedDates = [];
let cycleRequestIds = [];
let successfulApproval = false;

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

function getPlanAmountInRequest(item, planId) {
  if (item.status === "rejected" || item.type === "general") return 0;
  const allocations = Array.isArray(item.allocations) ? item.allocations : [];
  const hasAllocationPlanId = allocations.some((allocation) => allocation.packageId);
  if (hasAllocationPlanId) {
    return round8(allocations
      .filter((allocation) => String(allocation.packageId || "") === String(planId))
      .reduce((sum, allocation) => sum + Number(allocation.amount || 0), 0));
  }
  if (String(item.packageId || "") !== String(planId)) return 0;
  return round8(allocations.length
    ? allocations.reduce((sum, allocation) => sum + Number(allocation.amount || 0), 0)
    : Number(item.amount || 0));
}

function isCreatedToday(item, dayStart) {
  const timestamp = item.createdAt ? new Date(item.createdAt).getTime() : Number.NaN;
  return Number.isFinite(timestamp) && timestamp >= dayStart.getTime();
}

async function packageSnapshot(planId, userId) {
  const rows = await db.collection("userpackages")
    .find({ userId, packageId: planId })
    .sort({ createdAt: 1, _id: 1 })
    .toArray();
  return {
    balance: round8(rows.reduce((sum, row) => sum + Number(row.availableEarnings || 0), 0)),
    locked: round8(rows.reduce((sum, row) => sum + Number(row.lockedEarnings || 0), 0)),
    accountRows: rows.length,
    rows: rows.map((row) => ({
      id: String(row._id),
      availableEarnings: round8(row.availableEarnings),
      lockedEarnings: round8(row.lockedEarnings),
      investedAmount: round8(row.investedAmount),
      status: row.status,
    })),
  };
}

async function getSilverCard(planId) {
  const response = await api("/api/withdrawals", { cookie: userCookie });
  assert.equal(response.status, 200, "GET /api/withdrawals failed: " + (response.body.message || response.status));
  assert.equal(response.body.success, true, "GET /api/withdrawals did not return success.");
  const plan = (response.body.packages || []).find((item) => String(item._id) === String(planId));
  assert.ok(plan?.account?.hasAccount, "Silver package card was not returned by the API.");
  return plan;
}

async function requestSilver(amount, planId) {
  return api("/api/withdrawals", {
    method: "POST",
    cookie: userCookie,
    body: JSON.stringify({
      type: "package",
      packageId: String(planId),
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
  throw new Error("Isolated local API did not become ready. No Silver withdrawal was submitted. Log: " + logFile + "\n" + details);
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

async function restoreMovedDatesWhenNoApproval() {
  if (!db || !movedDates.length) return;
  let approvedCount = 0;
  if (cycleRequestIds.length) {
    approvedCount = await db.collection("withdrawalrequests").countDocuments({
      _id: { $in: cycleRequestIds.map((id) => new mongoose.Types.ObjectId(id)) },
      status: "approved",
    });
  }
  if (approvedCount > 0 || successfulApproval) return;
  for (const item of movedDates) {
    await db.collection("withdrawalrequests").updateOne(
      { _id: item._id },
      { $set: { createdAt: item.originalCreatedAt } },
    );
  }
  movedDates = [];
}

async function cleanupPendingCycleRequests(userId) {
  if (!db || !userId || !adminCookie || !baseUrl) return;
  for (const id of cycleRequestIds) {
    const row = await db.collection("withdrawalrequests").findOne({
      _id: new mongoose.Types.ObjectId(id),
      userId,
      status: "pending",
    });
    if (!row) continue;
    const result = await reviewWithdrawal(id, "reject");
    if (!result.ok || result.body?.success !== true) {
      console.error("Recovery warning: could not reject pending QA request " + id + ". Please inspect it before rerunning.");
    }
  }
}

async function main() {
  let user = null;
  let silver = null;
  let baselineRequestCount = 0;
  let amount = 0;
  let cap = 0;
  let movedRequestReport = [];
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

    silver = await db.collection("investmentpackages").findOne({ name: /^Silver$/i });
    assert.ok(silver, "Silver plan was not found in the test database.");
    assert.equal(round8(silver.price), 100, "Safety stop: Silver price is not the expected 100 USDT.");

    const allUserPackages = await db.collection("userpackages")
      .find({ userId: user._id })
      .sort({ createdAt: 1, _id: 1 })
      .toArray();
    const silverRows = allUserPackages.filter((row) => String(row.packageId) === String(silver._id));
    assert.ok(silverRows.length > 0, "QA user has no Silver package account.");
    const firstActivation = silverRows.find((row) => Number(row.investedAmount || 0) > 0);
    cap = round8(firstActivation?.investedAmount || 0);
    assert.equal(cap, 100, "Safety stop: first Silver activation is not 100 USDT.");
    amount = cap;

    const activePackages = allUserPackages.filter((row) => row.status === "active");
    assert.equal(activePackages.length, 1, "QA account must have exactly one active package.");
    assert.equal(String(activePackages[0].packageId), String(silver._id), "QA account must currently be active on Silver.");
    assert.equal(
      round8(allUserPackages.reduce((sum, row) => sum + Number(row.lockedEarnings || 0), 0)),
      0,
      "QA account already has locked package funds; no changes were made.",
    );

    const balanceBefore = await packageSnapshot(silver._id, user._id);
    assert.equal(balanceBefore.balance, 150, "Safety stop: existing Silver package balance is not 150 USDT.");
    assert.equal(balanceBefore.locked, 0, "Safety stop: Silver already has locked earnings.");
    const minimum = Number(silver.withdrawalMinimum || 100);
    assert.ok(minimum <= amount, "Configured Silver minimum exceeds the 100 USDT daily cap; stopped before creating a request.");

    const allRequestsBefore = await db.collection("withdrawalrequests")
      .find({ userId: user._id })
      .sort({ createdAt: 1, _id: 1 })
      .toArray();
    assert.equal(
      allRequestsBefore.filter((row) => row.status === "pending").length,
      0,
      "QA user already has a pending withdrawal. Resolve it before running the Silver cycle.",
    );
    baselineRequestCount = allRequestsBefore.length;

    const today = new Date();
    const dayStart = new Date(today);
    dayStart.setUTCHours(0, 0, 0, 0);
    const usedTodayBefore = round8(allRequestsBefore.reduce((sum, row) => {
      if (!["pending", "approved"].includes(row.status) || !isCreatedToday(row, dayStart)) return sum;
      return sum + getPlanAmountInRequest(row, silver._id);
    }, 0));
    assert.ok(usedTodayBefore <= cap, "Existing Silver withdrawal history already exceeds the daily cap; no changes were made.");

    await startIsolatedApp();
    userCookie = await login(user.username, password);

    const initialCard = await getSilverCard(silver._id);
    assert.equal(round8(initialCard.account.balance), balanceBefore.balance, "API Silver balance does not match the QA database.");
    assert.equal(round8(initialCard.account.allowance), round8(Math.max(0, cap - usedTodayBefore)),
      "API daily allowance does not match the current Silver withdrawal history.");

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

    // This QA database already has an approved Silver request using today's cap.
    // Move only the existing request timestamps back one UTC day; never change their amount or package balances.
    // This opens a clean daily allowance for a real API request/reject/request/approve cycle.
    const sameDaySilverApprovals = allRequestsBefore.filter((row) =>
      row.status === "approved" &&
      row.type !== "general" &&
      isCreatedToday(row, dayStart) &&
      getPlanAmountInRequest(row, silver._id) > 0
    );
    const sameDayUsedFromApprovals = round8(sameDaySilverApprovals.reduce(
      (sum, row) => sum + getPlanAmountInRequest(row, silver._id), 0
    ));
    assert.equal(sameDayUsedFromApprovals, usedTodayBefore,
      "Today's Silver allowance includes a row that cannot safely be reclassified as a previous-day QA request.");

    for (const row of sameDaySilverApprovals) {
      const allocationIds = (Array.isArray(row.allocations) ? row.allocations : [])
        .map((allocation) => String(allocation.packageId || ""))
        .filter(Boolean);
      assert.ok(
        allocationIds.every((id) => id === String(silver._id)),
        "A current-day request spans multiple packages; stopped before changing its timestamp.",
      );
      const updated = await db.collection("withdrawalrequests").updateOne(
        { _id: row._id, status: "approved" },
        { $set: { createdAt: new Date(dayStart.getTime() - 1000 * (movedDates.length + 1)) } },
      );
      assert.equal(updated.modifiedCount, 1, "Could not move an existing QA timestamp to the prior UTC day.");
      movedDates.push({ _id: row._id, originalCreatedAt: row.createdAt });
      movedRequestReport.push({
        requestId: String(row._id),
        previousCreatedAt: new Date(row.createdAt).toISOString(),
        testCreatedAt: new Date(dayStart.getTime() - 1000 * movedDates.length).toISOString(),
        amount: getPlanAmountInRequest(row, silver._id),
      });
    }

    const afterResetCard = await getSilverCard(silver._id);
    assert.equal(round8(afterResetCard.account.allowance), cap, "Silver daily cap did not reset after preparing the isolated QA day.");
    assert.equal(round8(afterResetCard.account.available), Math.min(balanceBefore.balance, cap),
      "Silver available amount after daily reset is incorrect.");
    const requestIdsBeforeCycle = (await db.collection("withdrawalrequests").find({ userId: user._id }).toArray())
      .map((row) => String(row._id));
    assert.equal(requestIdsBeforeCycle.length, baselineRequestCount, "Preparing the daily cap unexpectedly changed request count.");

    const firstRequest = await requestSilver(amount, silver._id);
    assert.equal(firstRequest.status, 201,
      "First Silver API withdrawal request failed: " + (firstRequest.body.message || firstRequest.status));
    const firstRow = await db.collection("withdrawalrequests").findOne({
      userId: user._id,
      status: "pending",
      packageId: silver._id,
      type: "package",
    }, { sort: { createdAt: -1 } });
    assert.ok(firstRow, "First Silver pending request was not stored.");
    cycleRequestIds.push(String(firstRow._id));
    assert.equal(round8(firstRow.amount), amount, "First Silver request amount is wrong.");
    assert.equal(round8((firstRow.allocations || []).reduce((sum, part) => sum + Number(part.amount || 0), 0)), amount,
      "First Silver request allocations do not add up to 100 USDT.");

    let state = await packageSnapshot(silver._id, user._id);
    assert.equal(state.balance, round8(balanceBefore.balance - amount), "Creating the request did not reserve 100 USDT from Silver available balance.");
    assert.equal(state.locked, amount, "Creating the request did not move 100 USDT to locked earnings.");
    const pendingCard = await getSilverCard(silver._id);
    assert.equal(round8(pendingCard.account.allowance), 0, "Pending Silver request did not consume today's cap.");
    assert.equal(round8(pendingCard.account.available), 0, "Pending Silver request should leave no daily allowance.");

    const duplicatePending = await requestSilver(amount, silver._id);
    assert.equal(duplicatePending.status, 409, "A second request was accepted while the first Silver request was pending.");
    assert.equal(duplicatePending.body.message, "لديك طلب سحب معلق بالفعل", "Unexpected duplicate-pending rejection.");
    assert.equal(
      await db.collection("withdrawalrequests").countDocuments({ userId: user._id }),
      baselineRequestCount + 1,
      "The duplicate pending attempt created an extra request.",
    );

    const rejected = await reviewWithdrawal(firstRow._id, "reject");
    assert.equal(rejected.status, 200, "Admin rejection endpoint returned HTTP " + rejected.status + ".");
    assert.equal(rejected.body?.success, true, "Admin rejection failed: " + (rejected.body?.message || "unknown error"));
    const firstAfterReview = await db.collection("withdrawalrequests").findOne({ _id: firstRow._id });
    assert.equal(firstAfterReview.status, "rejected", "First Silver request was not rejected.");
    state = await packageSnapshot(silver._id, user._id);
    assert.equal(state.balance, balanceBefore.balance, "Reject did not return 100 USDT to Silver available balance.");
    assert.equal(state.locked, 0, "Reject left Silver earnings locked.");
    const balanceAfterReject = state.balance;
    const afterRejectCard = await getSilverCard(silver._id);
    assert.equal(round8(afterRejectCard.account.allowance), cap, "Rejected request incorrectly consumed the daily Silver cap.");
    assert.equal(round8(afterRejectCard.account.available), Math.min(balanceBefore.balance, cap),
      "Silver availability did not recover after rejection.");

    const secondRequest = await requestSilver(amount, silver._id);
    assert.equal(secondRequest.status, 201,
      "Silver request after rejection failed: " + (secondRequest.body.message || secondRequest.status));
    const secondRow = await db.collection("withdrawalrequests").findOne({
      userId: user._id,
      status: "pending",
      packageId: silver._id,
      type: "package",
    }, { sort: { createdAt: -1 } });
    assert.ok(secondRow, "Replacement Silver pending request was not stored.");
    cycleRequestIds.push(String(secondRow._id));
    assert.notEqual(String(secondRow._id), String(firstRow._id), "Replacement request reused the rejected request ID.");

    state = await packageSnapshot(silver._id, user._id);
    assert.equal(state.balance, round8(balanceBefore.balance - amount), "Second request did not reserve 100 USDT.");
    assert.equal(state.locked, amount, "Second request did not lock exactly 100 USDT.");

    const approved = await reviewWithdrawal(secondRow._id, "approve");
    assert.equal(approved.status, 200, "Admin approval endpoint returned HTTP " + approved.status + ".");
    assert.equal(approved.body?.success, true, "Admin approval failed: " + (approved.body?.message || "unknown error"));
    successfulApproval = true;

    const secondAfterReview = await db.collection("withdrawalrequests").findOne({ _id: secondRow._id });
    assert.equal(secondAfterReview.status, "approved", "Second Silver request was not marked approved.");
    state = await packageSnapshot(silver._id, user._id);
    assert.equal(state.balance, round8(balanceBefore.balance - amount), "Approved withdrawal did not permanently reduce Silver available balance by 100 USDT.");
    assert.equal(state.locked, 0, "Approved withdrawal left a stale Silver locked balance.");

    const finalCard = await getSilverCard(silver._id);
    assert.equal(round8(finalCard.account.balance), round8(balanceBefore.balance - amount),
      "Final Silver card balance does not match the approved withdrawal.");
    assert.equal(round8(finalCard.account.allowance), 0, "Approved Silver request did not consume today's entire cap.");
    assert.equal(round8(finalCard.account.available), 0, "Final available-today amount should be zero after the 100 USDT approval.");

    const overCap = await requestSilver(amount, silver._id);
    assert.equal(overCap.status, 409, "Silver accepted another withdrawal after today's cap was used.");
    assert.equal(overCap.body.message, "تم استنفاد حد السحب اليومي لهذه الباقة",
      "Unexpected message after trying to exceed Silver's daily cap.");
    state = await packageSnapshot(silver._id, user._id);
    assert.equal(state.balance, round8(balanceBefore.balance - amount), "Rejected over-cap request unexpectedly changed Silver balance.");
    assert.equal(state.locked, 0, "Rejected over-cap request unexpectedly locked Silver funds.");
    assert.equal(
      await db.collection("withdrawalrequests").countDocuments({ userId: user._id }),
      baselineRequestCount + 2,
      "Unexpected request count; duplicate or over-cap attempts may have created a request.",
    );

    console.log(JSON.stringify({
      result: "PASS",
      database: dbName,
      server: "isolated local Next.js API started from this working tree",
      user: username,
      package: "Silver",
      activationCap: cap,
      packageBalanceBefore: balanceBefore.balance,
      existingTodayUsageBeforeTest: usedTodayBefore,
      previousApprovedQATimestampsMovedToPriorUtcDay: movedRequestReport,
      syntheticPackageCredit: false,
      directPackageBalanceWrite: false,
      cycle: {
        firstRequest: { amount, status: "rejected", balanceAfterReject, lockedAfterReject: 0 },
        secondRequest: { amount, status: "approved", balanceAfterApproval: state.balance, lockedAfterApproval: 0 },
        afterApproval: { balance: state.balance, allowanceToday: finalCard.account.allowance, availableToday: finalCard.account.available },
        anotherWithdrawalToday: { status: overCap.status, message: overCap.body.message, requestCreated: false },
      },
      checks: {
        requestReservationMovesAvailableToLocked: true,
        duplicatePendingRequestRejected: true,
        rejectionReturnsTheFullAmount: true,
        approvalConsumesTheFullAmount: true,
        approvedAndPendingRequestsConsumeDailyCap: true,
        rejectedRequestDoesNotConsumeDailyCap: true,
        overCapAttemptDoesNotChangeBalanceOrCreateRequest: true,
        noSyntheticBalanceAdded: true,
      },
      note: "This exercises the local API/accounting workflow only. It does not send USDT on-chain. Two Silver test requests are retained in arabtrade_test (one rejected, one approved).",
    }, null, 2));
  } finally {
    if (logFd !== null) {
      try { fs.closeSync(logFd); } catch {}
    }
    if (db && user) {
      await cleanupPendingCycleRequests(user._id).catch((error) => {
        console.error("Recovery warning:", error instanceof Error ? error.message : String(error));
      });
      await restoreMovedDatesWhenNoApproval().catch((error) => {
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
    note: "Only arabtrade_test is permitted. No synthetic package balance is added. If approval did not complete, any pending QA request is rejected during cleanup where possible, and adjusted timestamps are restored.",
  }, null, 2));
  process.exitCode = 1;
});
